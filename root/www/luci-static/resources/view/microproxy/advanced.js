'use strict';
'use ui';

return L.view.extend({
	load: function() {
		return L.uci.load('microproxy');
	},

	render: function() {
		// Inject Custom Stylesheet
		var css = document.createElement('link');
		css.rel = 'stylesheet';
		css.href = '/luci-static/resources/microproxy.css';
		document.head.appendChild(css);

		var m = new L.cbi.Map('microproxy', 'Дополнительные параметры', 'Тонкая настройка сетевых портов, сетевого стека, Fake-IP и встроенного детектора качества соединений (Failover).');

		// 1. Global Settings Section
		var global = m.section(L.cbi.NamedSection, 'main', 'global', 'Сетевые параметры ядра');
		global.anonymous = true;

		var tp = global.option(L.cbi.Value, 'tproxy_port', 'Порт TPROXY', 'Локальный порт Sing-box для перехвата сетевого трафика (TCP/UDP TPROXY).');
		tp.datatype = 'port';
		tp.default = '12345';
		tp.rmempty = false;

		var dp = global.option(L.cbi.Value, 'dns_port', 'Порт DNS Sing-box', 'Локальный порт, на котором запускается DNS-резолвер Sing-box.');
		dp.datatype = 'port';
		dp.default = '7913';
		dp.rmempty = false;

		var fip = global.option(L.cbi.Value, 'fakeip_range', 'Диапазон Fake-IP (IPv4 CIDR)', 'Выделенный диапазон виртуальных адресов для обхода блокировок. Трафик к этим адресам перехватывается автоматически.');
		fip.datatype = 'ip4addr';
		fip.default = '198.18.0.0/15';
		fip.rmempty = false;

		var to = global.option(L.cbi.Value, 'dynamic_timeout', 'Таймаут временного обхода (секунды)', 'Время жизни временно добавленных IP-адресов в динамическом множестве nftables (43200 секунд = 12 часов).');
		to.datatype = 'uinteger';
		to.default = '43200';
		to.rmempty = false;

		var agh = global.option(L.cbi.Flag, 'integrate_agh', 'Интеграция с AdGuard Home (Рекомендуется)', 
			'Включите, если используете AdGuard Home. В этом случае AdGuard Home должен работать на порту 53, а его Upstream DNS должен быть перенаправлен на 127.0.0.1:7913. Отключите, если хотите, чтобы Sing-box полностью занял системный DNS порт 53, автоматически сдвинув dnsmasq на порт 54.'
		);
		agh.default = '0';

		// 2. Observatory Failover Settings Section
		var obs = m.section(L.cbi.NamedSection, 'config', 'observatory', 'Параметры обсерватории (Failover)',
			'Обсерватория в фоне опрашивает тестовый URL через все активные прокси-серверы и автоматически переключает трафик на сервер с наименьшей задержкой.');
		
		var obs_en = obs.option(L.cbi.Flag, 'enabled', 'Включить автоматический Failover');
		obs_en.default = '1';

		var obs_int = obs.option(L.cbi.ListValue, 'interval', 'Интервал замера пинга');
		obs_int.value('1m', 'Каждую минуту');
		obs_int.value('3m', 'Каждые 3 минуты');
		obs_int.value('5m', 'Каждые 5 минут');
		obs_int.value('10m', 'Каждые 10 минут');
		obs_int.default = '5m';
		obs_int.depends('enabled', '1');

		var obs_url = obs.option(L.cbi.Value, 'probe_url', 'Тестовый URL (для пинга)');
		obs_url.datatype = 'url';
		obs_url.default = 'https://www.gstatic.com/generate_204';
		obs_url.rmempty = false;
		obs_url.depends('enabled', '1');

		var obs_tol = obs.option(L.cbi.Value, 'tolerance', 'Чувствительность переключения (мс)', 'Исключает постоянное переключение ("дребезг") между серверами с близким качеством связи. Переключение происходит, только если разница пинга превышает этот порог.');
		obs_tol.datatype = 'uinteger';
		obs_tol.default = '50';
		obs_tol.rmempty = false;
		obs_tol.depends('enabled', '1');

		return m.render();
	}
});
