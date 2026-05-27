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

		// 1. External Subscriptions Section
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

		// 2. Personal Custom Rules (Domains and IPs)
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
