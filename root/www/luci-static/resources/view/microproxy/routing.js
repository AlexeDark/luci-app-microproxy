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

		var m = new form.Map('microproxy', 'Настройки маршрутизации', 'Управление списками обхода блокировок, внешними подписками и персональными правилами.');

		// 1. Subscription Importer Card (Visual Panel at the top)
		var importerSection = m.section(form.NamedSection, 'main', 'global', '');
		importerSection.render = function() {
			return E('div', { 'class': 'mp-card' }, [
				E('h3', {}, '➕ Добавить новую подписку обхода'),
				E('p', { 'style': 'color:#64748b; font-size:0.9rem;' },
					'Вставьте URL-ссылку на внешний список заблокированных доменов или подсетей. Поддерживаются обычные текстовые списки (каждый домен/IP с новой строки) и скомпилированные бинарные списки правил Sing-box (.srs).'
				),
				E('div', { 'style': 'display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:1rem; margin-top:1.5rem;' }, [
					E('div', {}, [
						E('label', { 'style': 'font-weight:bold; font-size:0.85rem;' }, 'Название подписки:'),
						E('input', {
							'id': 'sub_name_input',
							'type': 'text',
							'placeholder': 'Например: Роскомсвобода',
							'style': 'width:100%; border-radius:10px; padding:0.5rem 0.75rem; border:1px solid rgba(128,128,128,0.25); background:rgba(128,128,128,0.08); color:inherit; margin-top:0.25rem; outline:none;'
						})
					]),
					E('div', {}, [
						E('label', { 'style': 'font-weight:bold; font-size:0.85rem;' }, 'Ссылка (URL):'),
						E('input', {
							'id': 'sub_url_input',
							'type': 'text',
							'placeholder': 'https://example.com/list.txt',
							'style': 'width:100%; border-radius:10px; padding:0.5rem 0.75rem; border:1px solid rgba(128,128,128,0.25); background:rgba(128,128,128,0.08); color:inherit; margin-top:0.25rem; outline:none;'
						})
					]),
					E('div', {}, [
						E('label', { 'style': 'font-weight:bold; font-size:0.85rem;' }, 'Формат списка:'),
						E('select', {
							'id': 'sub_format_select',
							'style': 'width:100%; border-radius:10px; padding:0.5rem 0.75rem; border:1px solid rgba(128,128,128,0.25); background:rgba(128,128,128,0.08); color:inherit; margin-top:0.25rem; outline:none;'
						}, [
							E('option', { 'value': 'text' }, 'Простой текст (Домены/IP)'),
							E('option', { 'value': 'srs' }, 'Бинарный rule-set (.srs)')
						])
					]),
					E('div', {}, [
						E('label', { 'style': 'font-weight:bold; font-size:0.85rem;' }, 'Интервал обновления:'),
						E('select', {
							'id': 'sub_interval_select',
							'style': 'width:100%; border-radius:10px; padding:0.5rem 0.75rem; border:1px solid rgba(128,128,128,0.25); background:rgba(128,128,128,0.08); color:inherit; margin-top:0.25rem; outline:none;'
						}, [
							E('option', { 'value': '24h' }, 'Раз в сутки'),
							E('option', { 'value': '12h' }, 'Каждые 12 часов'),
							E('option', { 'value': '7d' }, 'Раз в неделю')
						])
					])
				]),
				E('div', { 'style': 'display:flex; justify-content:flex-end; margin-top:1.5rem;' }, [
					E('button', {
						'class': 'mp-btn mp-btn-primary',
						'click': function(ev) {
							var nameInput = document.getElementById('sub_name_input');
							var urlInput = document.getElementById('sub_url_input');
							var formatSelect = document.getElementById('sub_format_select');
							var intervalSelect = document.getElementById('sub_interval_select');

							var name = nameInput.value.trim();
							var url = urlInput.value.trim();
							var format = formatSelect.value;
							var interval = intervalSelect.value;

							if (!name || !url) {
								L.ui.addNotification('warning', E('p', {}, 'Пожалуйста, заполните название и ссылку!'));
								return;
							}

							ev.target.disabled = true;

							// Save to UCI
							var sid = L.uci.add('microproxy', 'subscription');
							L.uci.set('microproxy', sid, 'enabled', '1');
							L.uci.set('microproxy', sid, 'name', name);
							L.uci.set('microproxy', sid, 'url', url);
							L.uci.set('microproxy', sid, 'format', format);
							L.uci.set('microproxy', sid, 'update_interval', interval);

							L.uci.save().then(function() {
								return L.uci.apply();
							}).then(function() {
								L.ui.addNotification('success', E('p', {}, 'Подписка "' + name + '" успешно добавлена!'));
								nameInput.value = '';
								urlInput.value = '';
								setTimeout(function() { window.location.reload(); }, 1500);
							}).catch(function(err) {
								L.ui.addNotification('danger', E('p', {}, 'Ошибка сохранения подписки: ' + err.message));
								ev.target.disabled = false;
							});
						}
					}, 'Добавить подписку')
				])
			]);
		};

		// 2. External Subscriptions Section (Table View)
		var sub = m.section(form.GridSection, 'subscription', 'Внешние списки обхода (Подписки)');
		sub.anonymous = true;
		sub.addremove = true;

		sub.option(form.Flag, 'enabled', 'Вкл.');
		
		var subName = sub.option(form.Value, 'name', 'Название');
		subName.placeholder = 'My List';
		subName.datatype = 'string';

		var subUrl = sub.option(form.Value, 'url', 'URL ссылка списка');
		subUrl.placeholder = 'https://example.com/list.txt';
		subUrl.datatype = 'url';

		var subFormat = sub.option(form.ListValue, 'format', 'Формат файла');
		subFormat.value('text', 'Простой текст (Домены/IP)');
		subFormat.value('srs', 'Скомпилированный rule-set (.srs)');
		subFormat.default = 'text';

		var subInt = sub.option(form.ListValue, 'update_interval', 'Интервал обновления');
		subInt.value('12h', 'Каждые 12 часов');
		subInt.value('24h', 'Раз в сутки');
		subInt.value('7d', 'Раз в неделю');
		subInt.default = '24h';

		// 3. Personal Custom Rules (Domains and IPs)
		var custom = m.section(form.TypedSection, 'custom_rules', 'Персональные правила (Пользовательский список)');
		custom.anonymous = true;
		custom.addremove = false;

		var customDomains = custom.option(form.DynamicList, 'domain', 'Ваши домены для обхода', 'Добавьте доменные имена (например, facebook.com, twitter.com), которые всегда должны идти через прокси.');
		customDomains.placeholder = 'youtube.com';

		var customIps = custom.option(form.DynamicList, 'ip', 'Ваши IP-адреса или подсети для обхода', 'Добавьте IP-адреса или CIDR диапазоны (например, 104.244.42.0/24), которые должны идти через прокси.');
		customIps.placeholder = '93.184.216.34';

		return m.render();
	}
});
