'use strict';
'use ui';

// RPC declarations using standard L.rpc
var rpc_list = L.rpc.declare({
	object: 'service',
	method: 'list',
	params: [ 'name' ]
});

var rpc_start = L.rpc.declare({
	object: 'service',
	method: 'start',
	params: [ 'name' ]
});

var rpc_stop = L.rpc.declare({
	object: 'service',
	method: 'stop',
	params: [ 'name' ]
});

return L.view.extend({
	load: function() {
		return Promise.all([
			rpc_list('microproxy'),
			L.uci.load('microproxy'),
			L.fs.read('/var/etc/microproxy/whitelist_ips.list').then(function(res) {
				return res ? res.trim().split('\n').length : 0;
			}).catch(function() { return 0; }),
			L.fs.exec('/usr/sbin/nft', ['list', 'set', 'inet', 'nft_microproxy', 'dynamic_ips']).then(function(res) {
				if (res && res.code === 0) {
					var match = res.stdout.match(/elements\s*=\s*\{\s*([^}]+)\s*\}/);
					if (match) {
						return match[1].split(',').map(function(s) { return s.trim(); });
					}
				}
				return [];
			}).catch(function() { return []; })
		]);
	},

	render: function(data) {
		var serviceList = data[0];
		var totalWhitelistIPs = data[2];
		var dynamicIPs = data[3];
		
		var running = false;
		if (serviceList && serviceList.microproxy && serviceList.microproxy.instances && serviceList.microproxy.instances.main) {
			running = serviceList.microproxy.instances.main.running;
		}

		// Inject Custom Stylesheet
		var css = document.createElement('link');
		css.rel = 'stylesheet';
		css.href = '/luci-static/resources/microproxy.css';
		document.head.appendChild(css);

		var container = E('div', { 'class': 'microproxy-container' }, [
			E('h2', { 'class': 'mp-header' }, 'MicroProxy Manager'),
			E('p', { 'class': 'mp-subtitle' }, 'Легковесный, безопасный и высокопроизводительный клиент обхода блокировок для OpenWrt.'),
			
			// Main Status Dashboard
			E('div', { 'class': 'mp-card' }, [
				E('h3', {}, 'Состояние системы'),
				E('div', { 'style': 'display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;' }, [
					E('div', {}, [
						E('span', { 'class': 'mp-status-badge ' + (running ? 'mp-status-active' : 'mp-status-inactive') }, [
							E('span', { 'class': 'pulse-dot' }),
							E('strong', {}, running ? 'ЗАПУЩЕН' : 'ОСТАНОВЛЕН')
						])
					]),
					E('div', { 'style': 'display:flex; gap:0.75rem;' }, [
						E('button', {
							'class': 'mp-btn mp-btn-primary',
							'click': function(ev) {
								ev.target.disabled = true;
								var action = running ? 'stop' : 'start';
								L.uci.set('microproxy', 'main', 'enabled', running ? '0' : '1');
								L.uci.save().then(function() {
									return L.uci.apply();
								}).then(function() {
									var svcCall = running ? rpc_stop : rpc_start;
									return svcCall('microproxy');
								}).then(function() {
									window.location.reload();
								}).catch(function(err) {
									L.ui.addNotification('danger', E('p', {}, 'Ошибка при управлении службой: ' + err.message));
									ev.target.disabled = false;
								});
							}
						}, running ? 'Остановить' : 'Запустить'),
						E('button', {
							'class': 'mp-btn mp-btn-secondary',
							'click': function(ev) {
								ev.target.disabled = true;
								L.fs.exec('/usr/share/microproxy/update_lists.sh').then(function(res) {
									L.ui.addNotification('info', E('p', {}, 'Списки обхода успешно обновлены!'));
									window.location.reload();
								}).catch(function(err) {
									L.ui.addNotification('danger', E('p', {}, 'Ошибка обновления списков: ' + err.message));
									ev.target.disabled = false;
								});
							}
						}, 'Обновить списки')
					])
				]),
				
				// Statistics grid
				E('div', { 'class': 'mp-grid-2' }, [
					E('div', { 'style': 'border-right: 1px solid rgba(0,0,0,0.1); padding-right:1rem;' }, [
						E('strong', {}, 'Режим маршрутизации: '),
						E('span', {}, 'Direct-by-Default (Белый список)'),
						E('br'),
						E('strong', {}, 'DNS сервер: '),
						E('span', {}, L.uci.get('microproxy', 'main', 'integrate_agh') === '1' ? 'AdGuard Home + Sing-box (7913)' : 'Sing-box Core (53)')
					]),
					E('div', { 'style': 'padding-left:1rem;' }, [
						E('strong', {}, 'IP в белом списке: '),
						E('span', {}, totalWhitelistIPs + ' адресов'),
						E('br'),
						E('strong', {}, 'Временных обходов: '),
						E('span', {}, dynamicIPs.length + ' активных IP-адресов')
					])
				])
			]),

			// Dynamic Routing Tool
			E('div', { 'class': 'mp-card' }, [
				E('h3', {}, '⚡ Быстрый временный обход (On-Demand)'),
				E('p', { 'style': 'color:#64748b; font-size:0.9rem;' }, 
					'Если зарубежный сайт не открывается, введите его домен ниже. Мы автоматически разрешим его в IP-адреса и добавим в nftables с таймаутом на 12 часов. Домены зоны .ru фильтруются для защиты от ложных срабатываний.'
				),
				E('div', { 'class': 'mp-quick-add' }, [
					E('input', {
						'id': 'quick_add_domain',
						'type': 'text',
						'placeholder': 'Например: instagram.com или custom-blocked-site.org'
					}),
					E('button', {
						'class': 'mp-btn mp-btn-primary',
						'click': function(ev) {
							var input = document.getElementById('quick_add_domain');
							var domain = input.value.trim().toLowerCase();
							if (!domain) return;

							// Protection against RU zone
							if (domain.endsWith('.ru') || domain.endsWith('.рф')) {
								L.ui.addNotification('warning', E('p', {}, 'Внимание! Ресурсы зоны RU не рекомендуется пускать через прокси во избежание блокировок со стороны их антифрод-систем.'));
								return;
							}

							ev.target.disabled = true;
							input.disabled = true;

							// Resolve domain via standard DNS
							L.fs.exec('/usr/sbin/nslookup', [domain]).then(function(res) {
								if (res.code !== 0) {
									throw new Error('Не удалось разрешить домен в IP!');
								}
								
								// Extract IPs using regex
								var ips = [];
								var lines = res.stdout.split('\n');
								for (var i = 2; i < lines.length; i++) {
									var match = lines[i].match(/Address:\s*([0-9.]+)/);
									if (match) {
										ips.push(match[1]);
									}
								}

								if (ips.length === 0) {
									throw new Error('IP-адреса для домена не найдены.');
								}

								// Add each IP to nftables dynamic set
								var promises = ips.map(function(ip) {
									return L.fs.exec('/usr/sbin/nft', ['add', 'element', 'inet', 'nft_microproxy', 'dynamic_ips', '{', ip, 'timeout', '43200s', '}']);
								});

								return Promise.all(promises).then(function() {
									return ips;
								});
							}).then(function(addedIps) {
								L.ui.addNotification('success', E('p', {}, 'Домен ' + domain + ' (' + addedIps.join(', ') + ') временно направлен через прокси на 12 часов!'));
								input.value = '';
								setTimeout(function() { window.location.reload(); }, 2000);
							}).catch(function(err) {
								L.ui.addNotification('danger', E('p', {}, 'Ошибка добавления: ' + err.message));
								ev.target.disabled = false;
								input.disabled = false;
							});
						}
					}, 'Добавить в прокси')
				]),

				// Dynamic IPs list
				dynamicIPs.length > 0 ? E('div', { 'style': 'margin-top: 1.5rem;' }, [
					E('h4', {}, 'Текущие временные IP-адреса в памяти:'),
					E('div', { 'style': 'max-height: 150px; overflow-y: auto; background:rgba(0,0,0,0.03); padding:0.75rem; border-radius:8px; font-family:monospace; font-size:0.85rem;' }, [
						dynamicIPs.map(function(ip) {
							return E('div', { 'style': 'display:flex; justify-content:space-between; margin-bottom:0.25rem;' }, [
								E('span', {}, ip),
								E('a', {
									'href': '#',
									'style': 'color:#ef4444; text-decoration:none;',
									'click': function(ev) {
										ev.preventDefault();
										var rawIp = ip.split(' ')[0];
										L.fs.exec('/usr/sbin/nft', ['delete', 'element', 'inet', 'nft_microproxy', 'dynamic_ips', '{', rawIp, '}']).then(function() {
											window.location.reload();
										});
									}
								}, 'Удалить')
							]);
						})
					])
				]) : E('p', { 'style': 'color:#64748b; font-size:0.85rem; margin-top:1rem;' }, 'Нет активных временных обходов в памяти.')
			]),

			// System Logs console
			E('div', { 'class': 'mp-card' }, [
				E('h3', {}, 'Журнал системных логов (Sing-box)'),
				E('div', { 'style': 'margin-top: 1rem;' }, [
					E('textarea', {
						'id': 'log_output',
						'readonly': 'readonly',
						'wrap': 'off',
						'rows': 15,
						'style': 'width:100%; font-family:monospace; font-size:0.8rem; background:#1e1e2e; color:#a6adc8; border-radius:12px; padding:1rem; border:none; resize:vertical; outline:none;'
					}, 'Загрузка системных логов...'),
					E('div', { 'style': 'display:flex; justify-content:flex-end; gap:0.5rem; margin-top:0.75rem;' }, [
						E('button', {
							'class': 'mp-btn mp-btn-secondary',
							'click': function() {
								var logArea = document.getElementById('log_output');
								L.fs.exec('/sbin/logread', ['-l', '100']).then(function(res) {
									if (res && res.stdout) {
										var lines = res.stdout.trim().split('\n').filter(function(line) {
											var l = line.toLowerCase();
											return l.indexOf('sing-box') !== -1 || l.indexOf('microproxy') !== -1;
										});
										logArea.value = lines.length ? lines.join('\n') : 'Сообщений от Sing-box / MicroProxy не обнаружено в системном журнале.';
									} else {
										logArea.value = 'Системный журнал пуст.';
									}
									logArea.scrollTop = logArea.scrollHeight;
								});
							}
						}, 'Обновить логи')
					])
				])
			])
		]);

		// Load logs automatically on mount
		setTimeout(function() {
			var logArea = document.getElementById('log_output');
			if (logArea) {
				L.fs.exec('/sbin/logread', ['-l', '100']).then(function(res) {
					if (res && res.stdout) {
						var lines = res.stdout.trim().split('\n').filter(function(line) {
							var l = line.toLowerCase();
							return l.indexOf('sing-box') !== -1 || l.indexOf('microproxy') !== -1;
						});
						logArea.value = lines.length ? lines.join('\n') : 'Сообщений от Sing-box / MicroProxy не обнаружено в системном журнале.';
					} else {
						logArea.value = 'Системный журнал пуст.';
					}
					logArea.scrollTop = logArea.scrollHeight;
				});
			}
		}, 100);

		return container;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
