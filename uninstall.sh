#!/bin/sh
# Uninstaller for luci-app-microproxy
# Created by Senior Embedded System Engineer
# Usage: wget -qO- https://raw.githubusercontent.com/AlexeDark/luci-app-microproxy/main/uninstall.sh | sh

echo "=== Starting Luci-App-MicroProxy Uninstallation ==="

# 1. Stop and disable the service to restore network/firewall/dnsmasq states
if [ -f /etc/init.d/microproxy ]; then
	echo "Stopping and disabling MicroProxy service..."
	/etc/init.d/microproxy stop 2>/dev/null
	/etc/init.d/microproxy disable 2>/dev/null
fi

# 2. Remove cron daily update job
if [ -f /etc/crontabs/root ]; then
	echo "Removing cron job..."
	sed -i '/update_lists.sh/d' /etc/crontabs/root
	/etc/init.d/cron restart 2>/dev/null
fi

# 3. Clean up all installed files
echo "Deleting package files..."
rm -f /etc/config/microproxy
rm -f /etc/init.d/microproxy
rm -f /etc/uci-defaults/luci-app-microproxy
rm -rf /usr/share/microproxy
rm -f /usr/share/luci/menu.d/luci-app-microproxy.json
rm -f /usr/share/rpcd/acl.d/luci-app-microproxy.json
rm -f /www/luci-static/resources/microproxy.css
rm -rf /www/luci-static/resources/view/microproxy

# Delete generated/temporary configurations and rule-sets
rm -rf /var/etc/microproxy

# 4. Refresh LuCI compilation cache and restart web services
echo "Rebuilding LuCI cache and restarting web services..."
rm -f /tmp/luci-indexcache /tmp/luci-modulecache
/etc/init.d/rpcd restart
/etc/init.d/uhttpd restart

echo "=== Uninstallation Completed Successfully! ==="
