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

		var m = new form.Map('microproxy', 'Прокси-серверы', 'Добавление, редактирование и групповой импорт серверов VLESS Reality (TCP / XHTTP).');

		// 1. Dual-Import Card (Single Link + Subscription URL)
		var importerSection = m.section(form.NamedSection, 'main', 'global', '');
		importerSection.render = function() {
			return E('div', { 'class': 'mp-card' }, [
				E('h3', {}, '📥 Быстрое добавление серверов'),
				E('p', { 'style': 'color:#64748b; font-size:0.9rem;' },
					'Выберите удобный способ добавления: импортируйте одиночную vless:// ссылку или вставьте URL подписки от вашего провайдера (обычный текст или Base64). Скрипт автоматически добавит все найденные серверы.'
				),
				
				E('div', { 'style': 'display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:2rem; margin-top:1.5rem;' }, [
					
					// Column 1: Single Link Importer
					E('div', { 'style': 'border-right: 1px solid rgba(128, 128, 128, 0.15); padding-right: 1.5rem;' }, [
						E('h4', { 'style': 'margin-bottom: 0.5rem;' }, '🔗 Импорт одиночной ссылки'),
						E('textarea', {
							'id': 'vless_link_input',
							'rows': 3,
							'placeholder': 'vless://uuid@host:port?security=reality&sni=...#MyServer',
							'style': 'width:100%; border-radius:10px; padding:0.5rem 0.75rem; border:1px solid rgba(128,128,128,0.25); background:rgba(128,128,128,0.08); color:inherit; outline:none; font-family:monospace; font-size:0.8rem; resize:none;'
						}),
						E('div', { 'style': 'display:flex; justify-content:flex-end; margin-top:0.75rem;' }, [
							E('button', {
								'class': 'mp-btn mp-btn-primary',
								'style': 'padding: 0.5rem 1rem; font-size: 0.85rem;',
								'click': function(ev) {
									var textarea = document.getElementById('vless_link_input');
									var link = textarea.value.trim();
									if (!link) return;

									try {
										var parsed = parseVlessLink(link);
										
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
					]),
					
					// Column 2: Subscription URL Importer
					E('div', {}, [
						E('h4', { 'style': 'margin-bottom: 0.5rem;' }, '📥 Импорт подписки по URL'),
						E('input', {
							'id': 'vless_sub_input',
							'type': 'text',
							'placeholder': 'https://my-vpn-provider.com/sub/xyz123',
							'style': 'width:100%; border-radius:10px; padding:0.5rem 0.75rem; border:1px solid rgba(128,128,128,0.25); background:rgba(128,128,128,0.08); color:inherit; outline:none; font-size:0.85rem;'
						}),
						E('p', { 'style': 'color:#64748b; font-size:0.75rem; margin-top:0.5rem;' }, 'Поддерживаются URL-адреса, возвращающие текстовые списки или Base64-код.'),
						E('div', { 'style': 'display:flex; justify-content:flex-end; margin-top:0.75rem;' }, [
							E('button', {
								'class': 'mp-btn mp-btn-primary',
								'style': 'padding: 0.5rem 1rem; font-size: 0.85rem;',
								'click': function(ev) {
									var input = document.getElementById('vless_sub_input');
									var url = input.value.trim();
									if (!url) return;

									ev.target.disabled = true;
									input.disabled = true;

									L.ui.addNotification('info', E('p', {}, 'Загрузка списка серверов...'));

									// Securely fetch using router's curl (bypasses CORS restrictions)
									L.fs.exec('/usr/bin/curl', ['-s', '-L', '-k', '--connect-timeout', '10', url]).then(function(res) {
										if (res.code !== 0 || !res.stdout) {
											throw new Error('Не удалось скачать данные подписки. Проверьте ссылку или интернет роутера.');
										}

										var rawContent = res.stdout;
										var decodedText = decodeSubContent(rawContent);
										
										var lines = decodedText.split(/\r?\n/);
										var importedCount = 0;

										lines.forEach(function(line) {
											line = line.trim();
											if (line.startsWith('vless://')) {
												try {
													var parsed = parseVlessLink(line);
													
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
													importedCount++;
												} catch (e) {
													// Skip invalid links silently
												}
											}
										});

										if (importedCount === 0) {
											throw new Error('В подписке не найдено корректных серверов VLESS!');
										}

										return L.uci.save().then(function() {
											return L.uci.apply();
										}).then(function() {
											L.ui.addNotification('success', E('p', {}, 'Успешно импортировано серверов VLESS: ' + importedCount));
											input.value = '';
											setTimeout(function() { window.location.reload(); }, 1500);
										});
									}).catch(function(err) {
										L.ui.addNotification('danger', E('p', {}, 'Ошибка импорта: ' + err.message));
										ev.target.disabled = false;
										input.disabled = false;
									});
								}
							}, 'Импортировать подписку')
						])
					])
				])
			]);
		};

		// 2. Standard Grid Section for CRUD operations
		var s = m.section(form.GridSection, 'server', 'Список прокси-серверов');
		s.anonymous = true;
		s.addremove = true;
		s.sortable = true;

		// Server Fields in Table View
		s.option(form.Flag, 'enabled', 'Вкл.');
		
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

// Base64 helper check and decoder
function decodeSubContent(content) {
	content = content.trim();
	if (!content.startsWith('vless://')) {
		try {
			var clean = content.replace(/\s/g, '');
			var decoded = atob(clean);
			if (decoded && decoded.indexOf('vless://') !== -1) {
				return decoded;
			}
		} catch (e) {
			// Not Base64 or decoding failed
		}
	}
	return content;
}

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
