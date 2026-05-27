'use strict';
'use ui';

return L.view.extend({
	load: function() {
		return Promise.all([
			L.uci.load('microproxy'),
			L.resolveDefault(L.require('form'))
		]);
	},

	render: function(data) {
		var form = data[1];

		// Inject Custom Stylesheet
		var css = document.createElement('link');
		css.rel = 'stylesheet';
		css.href = '/luci-static/resources/microproxy.css';
		document.head.appendChild(css);

		var subs = L.uci.sections('microproxy', 'server_subscription') || [];
		var subMap = {};
		subs.forEach(function(sb) {
			subMap[sb['.name']] = sb.name || 'Подписка';
		});

		function showSubscriptionServersModal(subId, subName) {
			var servers = L.uci.sections('microproxy', 'server') || [];
			var subServers = servers.filter(function(s) {
				return s.subscribe_group === subId;
			});

			var modalBody = E('div', { 'class': 'mp-modal-body' }, [
				E('p', { 'style': 'margin-bottom:1rem; color:#64748b;' }, 
					'Ниже представлены все серверы, полученные из этой подписки. Вы можете проверить их пинг и выбрать активный сервер.'
				)
			]);

			if (subServers.length === 0) {
				modalBody.appendChild(E('div', { 'style': 'padding:1.5rem; text-align:center; color:#94a3b8; font-style:italic;' }, 'Нет импортированных серверов для этой подписки. Нажмите кнопку "Обновить VLESS подписки", чтобы загрузить их.'));
			} else {
				var listContainer = E('div', { 'style': 'display:flex; flex-direction:column; gap:0.5rem; max-height:400px; overflow-y:auto;' });
				
				subServers.forEach(function(server) {
					var serverId = server['.name'];
					
					var selectBtn = E('button', {
						'class': 'mp-btn mp-btn-primary',
						'style': 'padding:0.25rem 0.75rem; font-size:0.75rem;',
						'click': function(ev) {
							ev.target.disabled = true;
							L.ui.showIndicator();
							
							L.uci.set('microproxy', serverId, 'enabled', '1');
							L.uci.set('microproxy', 'main', 'active_server', serverId);
							
							L.uci.save().then(function() {
								return L.uci.apply();
							}).then(function() {
								L.ui.closeModal();
								L.ui.addNotification('success', E('p', {}, 'Сервер "' + (server.alias || 'VLESS') + '" выбран как активный!'));
								setTimeout(function() { window.location.reload(); }, 1500);
							}).catch(function(err) {
								L.ui.addNotification('danger', E('p', {}, 'Ошибка: ' + err.message));
								L.ui.hideIndicator();
								ev.target.disabled = false;
							});
						}
					}, 'Выбрать');

					var pingBtn = E('button', {
						'class': 'mp-btn mp-btn-secondary ping-indicator',
						'style': 'padding:0.25rem 0.5rem; font-size:0.75rem; min-width:80px;',
						'click': function(ev) {
							ev.preventDefault();
							ev.target.textContent = '...';
							ev.target.className = 'mp-btn mp-btn-secondary ping-indicator';
							
							L.fs.exec('/bin/ping', ['-c', '3', '-W', '2', server.server]).then(function(res) {
								if (res && res.code === 0) {
									var match = res.stdout.match(/rtt min\/avg\/max\/mdev = [0-9.]+\/([0-9.]+)/);
									if (match) {
										var avg = parseFloat(match[1]);
										ev.target.textContent = avg.toFixed(0) + ' ms';
										if (avg < 80) {
											ev.target.className = 'mp-btn mp-btn-secondary ping-indicator ping-fast';
										} else if (avg < 180) {
											ev.target.className = 'mp-btn mp-btn-secondary ping-indicator ping-medium';
										} else {
											ev.target.className = 'mp-btn mp-btn-secondary ping-indicator ping-slow';
										}
										return;
									}
								}
								ev.target.textContent = 'Недоступен';
								ev.target.className = 'mp-btn mp-btn-secondary ping-indicator ping-slow';
							}).catch(function() {
								ev.target.textContent = 'Ошибка';
								ev.target.className = 'mp-btn mp-btn-secondary ping-indicator ping-slow';
							});
						}
					}, 'Пинг');

					var isActive = (L.uci.get('microproxy', 'main', 'active_server') === serverId);

					var row = E('div', { 
						'class': 'mp-modal-row' + (isActive ? ' mp-modal-row-active' : ''),
						'style': 'display:flex; justify-content:space-between; align-items:center; padding:0.75rem; border-radius:8px; background:rgba(0,0,0,0.02); border:1px solid rgba(0,0,0,0.05);' 
					}, [
						E('div', { 'style': 'display:flex; flex-direction:column; gap:0.15rem; flex:1;' }, [
							E('div', { 'style': 'font-weight:bold; font-size:0.9rem;' }, [
								server.alias || 'VLESS',
								isActive ? E('span', { 'style': 'margin-left:0.5rem; font-size:0.7rem; background:#22c55e; color:#fff; padding:0.1rem 0.4rem; border-radius:4px;' }, 'Активен') : ''
							]),
							E('div', { 'style': 'color:#64748b; font-size:0.8rem; font-family:monospace;' }, server.server + ':' + (server.server_port || '443') + ' (' + (server.transport === 'xhttp' ? 'XHTTP' : 'TCP') + ')')
						]),
						E('div', { 'style': 'display:flex; gap:0.5rem; align-items:center;' }, [
							pingBtn,
							selectBtn
						])
					]);

					listContainer.appendChild(row);
				});

				modalBody.appendChild(listContainer);
			}

			var footer = E('div', { 'class': 'right', 'style': 'margin-top:1.5rem; text-align:right;' }, [
				E('button', {
					'class': 'mp-btn mp-btn-secondary',
					'click': L.ui.closeModal
				}, 'Закрыть')
			]);
			modalBody.appendChild(footer);

			L.ui.showModal('Серверы подписки: ' + subName, modalBody);
		}

		var m = new form.Map('microproxy', 'Прокси-серверы', 'Добавление, редактирование и автоматическая синхронизация серверов VLESS Reality.');

		// 1. Single Link Quick Importer Card
		var importerSection = m.section(form.NamedSection, 'main', 'global', '');
		importerSection.render = function() {
			return E('div', { 'class': 'mp-card' }, [
				E('h3', {}, '🔗 Умный импорт одиночной VLESS ссылки'),
				E('p', { 'style': 'color:#64748b; font-size:0.9rem;' },
					'Вставьте одиночную ссылку vless:// в поле ниже. Умный парсер автоматически извлечет все Reality параметры (SNI, Public Key, Short ID, Flow). Если ссылка использует транспорт XHTTP, плагин принудительно включит режим "packet" и padding-маскировку для обхода ТСПУ.'
				),
				E('div', { 'style': 'display:flex; flex-direction:column; gap:0.75rem; margin-top:1rem;' }, [
					E('textarea', {
						'id': 'vless_link_input',
						'rows': 2,
						'placeholder': 'vless://uuid@host:port?security=reality&sni=...#MyServer',
						'style': 'width:100%; border-radius:12px; padding:0.75rem; border:1px solid rgba(128,128,128,0.25); background:rgba(128,128,128,0.08); color:inherit; outline:none; font-family:monospace; font-size:0.8rem; resize:none;'
					}),
					E('div', { 'style': 'display:flex; justify-content:flex-end;' }, [
						E('button', {
							'class': 'mp-btn mp-btn-primary',
							'style': 'padding: 0.5rem 1.25rem; font-size: 0.85rem;',
							'click': function(ev) {
								var textarea = document.getElementById('vless_link_input');
								var link = textarea.value.trim();
								if (!link) return;

								try {
									var parsed = parseVlessLink(link);
									
									// Save to UCI
									var sid = L.uci.add('microproxy', 'server');
									L.uci.set('microproxy', sid, 'enabled', '1');
									L.uci.set('microproxy', sid, 'alias', parsed.alias);
									L.uci.set('microproxy', sid, 'type', 'vless');
									L.uci.set('microproxy', sid, 'server', parsed.server);
									L.uci.set('microproxy', sid, 'server_port', parsed.server_port);
									L.uci.set('microproxy', sid, 'uuid', parsed.uuid);
									L.uci.set('microproxy', sid, 'flow', parsed.flow);
									L.uci.set('microproxy', sid, 'transport', parsed.transport);
									L.uci.set('microproxy', sid, 'tls', parsed.tls);
									L.uci.set('microproxy', sid, 'server_name', parsed.server_name);
									L.uci.set('microproxy', sid, 'public_key', parsed.public_key);
									L.uci.set('microproxy', sid, 'short_id', parsed.short_id);
									
									if (parsed.transport === 'xhttp') {
										L.uci.set('microproxy', sid, 'xhttp_mode', parsed.xhttp_mode);
										L.uci.set('microproxy', sid, 'xhttp_padding', parsed.xhttp_padding);
									}

									ev.target.disabled = true;
									
									L.uci.save().then(function() {
										return L.uci.apply();
									}).then(function() {
										L.ui.addNotification('success', E('p', {}, 'Сервер "' + parsed.alias + '" успешно добавлен!'));
										textarea.value = '';
										setTimeout(function() { window.location.reload(); }, 1500);
									}).catch(function(err) {
										L.ui.addNotification('danger', E('p', {}, 'Ошибка UCI: ' + err.message));
										ev.target.disabled = false;
									});
								} catch (err) {
									L.ui.addNotification('danger', E('p', {}, 'Ошибка парсинга: ' + err.message));
								}
							}
						}, 'Импортировать ссылку')
					])
				])
			]);
		};

		// 2. VLESS Persistent Subscriptions Manager
		var sub = m.section(form.GridSection, 'server_subscription', 'Подписки на списки VLESS-серверов');
		sub.anonymous = true;
		sub.addremove = true;

		sub.option(form.Flag, 'enabled', 'Вкл.');
		
		var subName = sub.option(form.Value, 'name', 'Название подписки');
		subName.placeholder = 'My VPN Provider';
		subName.datatype = 'string';

		var subUrl = sub.option(form.Value, 'url', 'URL ссылка подписки');
		subUrl.placeholder = 'https://veravpn.ru/sub/abc123xyz';
		subUrl.datatype = 'url';

		var subShow = sub.option(form.DummyValue, '_show_servers', 'Список серверов');
		subShow.render = function(section_id) {
			var name = L.uci.get('microproxy', section_id, 'name') || 'Подписка';
			return E('button', {
				'class': 'mp-btn mp-btn-secondary',
				'style': 'padding: 0.25rem 0.5rem; font-size: 0.75rem;',
				'click': function(ev) {
					ev.preventDefault();
					showSubscriptionServersModal(section_id, name);
				}
			}, 'Показать серверы');
		};

		// Custom button to trigger background VLESS subscriptions update
		var updateBtnSection = m.section(form.NamedSection, 'main', 'global', '');
		updateBtnSection.render = function() {
			return E('div', { 'style': 'display:flex; justify-content:flex-start; margin-bottom: 2rem;' }, [
				E('button', {
					'class': 'mp-btn mp-btn-primary',
					'click': function(ev) {
						ev.target.disabled = true;
						L.ui.addNotification('info', E('p', {}, 'Запущено автообновление подписок...'));
						
						L.fs.exec('/usr/share/microproxy/update_vless_sub.sh').then(function(res) {
							if (res.code === 0) {
								L.ui.addNotification('success', E('p', {}, 'Синхронизация VLESS-подписок успешно завершена!'));
								setTimeout(function() { window.location.reload(); }, 1500);
							} else {
								throw new Error(res.stderr || 'Неизвестная ошибка скрипта синхронизации');
							}
						}).catch(function(err) {
							L.ui.addNotification('danger', E('p', {}, 'Ошибка синхронизации подписок: ' + err.message));
							ev.target.disabled = false;
						});
					}
				}, '🔄 Обновить VLESS подписки')
			]);
		};

		// 3. Compact Grid Section for Server List
		var s = m.section(form.GridSection, 'server', 'Список прокси-серверов');
		s.anonymous = true;
		s.addremove = true;
		s.sortable = true;

		// Server Fields in Table View
		s.option(form.Flag, 'enabled', 'Вкл.');

		var group = s.option(form.DummyValue, 'subscribe_group', 'Источник');
		group.render = function(section_id) {
			var groupId = L.uci.get('microproxy', section_id, 'subscribe_group');
			var name = groupId ? (subMap[groupId] || 'Подписка') : 'Вручную';
			return E('span', { 'class': 'mp-badge-source' }, name);
		};
		
		var alias = s.option(form.Value, 'alias', 'Название');
		alias.placeholder = 'My Server';
		alias.datatype = 'string';

		var host = s.option(form.Value, 'server', 'Адрес');
		host.datatype = 'host';
		host.placeholder = '1.2.3.4';

		var port = s.option(form.Value, 'server_port', 'Порт');
		port.datatype = 'port';
		port.placeholder = '443';

		var transport = s.option(form.ListValue, 'transport', 'Транспорт');
		transport.value('tcp', 'TCP');
		transport.value('xhttp', 'Reality-XHTTP (быстрый)');
		transport.default = 'tcp';

		// Form detail settings popup (when user clicks "Edit")
		var uuid = s.option(form.Value, 'uuid', 'UUID (ID пользователя)');
		uuid.rmempty = false;
		uuid.modalonly = true;

		var flow = s.option(form.Value, 'flow', 'Flow (Поток)');
		flow.value('xtls-rprx-vision', 'xtls-rprx-vision (Рекомендуется для TCP)');
		flow.rmempty = true;
		flow.modalonly = true;
		
		var tls = s.option(form.Flag, 'tls', 'Включить Reality/TLS');
		tls.default = '1';
		tls.modalonly = true;

		var sni = s.option(form.Value, 'server_name', 'SNI (Маскировка)');
		sni.placeholder = 'yahoo.com';
		sni.depends('tls', '1');
		sni.modalonly = true;

		var pbk = s.option(form.Value, 'public_key', 'Public Key (Публичный ключ)');
		pbk.placeholder = 'Reality Public Key';
		pbk.depends('tls', '1');
		pbk.modalonly = true;

		var sid = s.option(form.Value, 'short_id', 'Short ID');
		sid.placeholder = 'Short ID (Hex)';
		sid.depends('tls', '1');
		sid.modalonly = true;

		var xm = s.option(form.ListValue, 'xhttp_mode', 'Режим XHTTP');
		xm.value('packet', 'packet (Эмуляция UDP-пакетов)');
		xm.value('stream', 'stream (Потоковый)');
		xm.depends('transport', 'xhttp');
		xm.default = 'packet';
		xm.modalonly = true;

		var xp = s.option(form.Value, 'xhttp_padding', 'Размер паддинга XHTTP');
		xp.placeholder = '100-1000';
		xp.depends('transport', 'xhttp');
		xp.default = '100-1000';
		xp.modalonly = true;

		// Ping action button inside grid
		s.option(form.DummyValue, 'ping', 'Задержка (RTT)').render = function(section_id) {
			var pingBtn = E('button', {
				'class': 'mp-btn mp-btn-secondary ping-indicator',
				'style': 'padding: 0.25rem 0.5rem; font-size: 0.75rem;',
				'click': function(ev) {
					ev.preventDefault();
					ev.target.textContent = '...';
					ev.target.className = 'mp-btn mp-btn-secondary ping-indicator';
					
					var serverIp = L.uci.get('microproxy', section_id, 'server');
					if (!serverIp) {
						ev.target.textContent = 'Ошибка';
						return;
					}

					// Quick ping via L.fs.exec
					L.fs.exec('/bin/ping', ['-c', '3', '-W', '2', serverIp]).then(function(res) {
						if (res && res.code === 0) {
							var match = res.stdout.match(/rtt min\/avg\/max\/mdev = [0-9.]+\/([0-9.]+)/);
							if (match) {
								var avg = parseFloat(match[1]);
								ev.target.textContent = avg.toFixed(0) + ' ms';
								if (avg < 80) {
									ev.target.className = 'mp-btn mp-btn-secondary ping-indicator ping-fast';
								} else if (avg < 180) {
									ev.target.className = 'mp-btn mp-btn-secondary ping-indicator ping-medium';
								} else {
									ev.target.className = 'mp-btn mp-btn-secondary ping-indicator ping-slow';
								}
								return;
							}
						}
						ev.target.textContent = 'Недоступен';
						ev.target.className = 'mp-btn mp-btn-secondary ping-indicator ping-slow';
					}).catch(function() {
						ev.target.textContent = 'Ошибка';
						ev.target.className = 'mp-btn mp-btn-secondary ping-indicator ping-slow';
					});
				}
			}, 'Тест пинга');
			
			return E('div', {}, [ pingBtn ]);
		};

		return m.render();
	}
});

// Helper parser for VLESS Reality strings
function parseVlessLink(link) {
	link = link.trim();
	if (!link.startsWith('vless://')) {
		throw new Error('Некорректная ссылка! Ссылка должна начинаться с vless://');
	}

	var parts = link.substring(8).split('#');
	var rawConfig = parts[0];
	var alias = parts[1] ? decodeURIComponent(parts[1]) : 'VLESS Reality Importer';

	var credentialsParts = rawConfig.split('@');
	if (credentialsParts.length < 2) {
		throw new Error('Не найден разделитель @ в ссылке!');
	}
	var uuid = credentialsParts[0];
	var rest = credentialsParts[1];

	var queryParts = rest.split('?');
	var serverPort = queryParts[0];
	var query = queryParts[1] || '';

	var serverPortParts = serverPort.split(':');
	var server = serverPortParts[0];
	var port = serverPortParts[1] || '443';

	var params = {};
	query.split('&').forEach(function(param) {
		var kv = param.split('=');
		if (kv[0]) {
			params[kv[0]] = decodeURIComponent(kv[1] || '');
		}
	});

	var transport = params.type || 'tcp';
	var tls = (params.security === 'reality') ? '1' : '0';
	var flow = params.flow || '';
	var serverName = params.sni || '';
	var publicKey = params.pbk || '';
	var shortId = params.sid || '';

	var xhttp_mode = '';
	var xhttp_padding = '';
	if (transport === 'xhttp') {
		xhttp_mode = params.mode || 'packet';
		xhttp_padding = params.x_padding_bytes || '100-1000';
	}

	return {
		alias: alias,
		server: server,
		server_port: port,
		uuid: uuid,
		flow: flow,
		transport: transport,
		tls: tls,
		server_name: serverName,
		public_key: publicKey,
		short_id: shortId,
		xhttp_mode: xhttp_mode,
		xhttp_padding: xhttp_padding
	};
}
