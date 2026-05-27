#!/bin/sh
# Remote Installer for luci-app-microproxy
# Created by Senior Embedded System Engineer
# Usage: wget -qO- https://raw.githubusercontent.com/AlexeDark/luci-app-microproxy/main/install.sh | sh

REPO_URL="https://raw.githubusercontent.com/AlexeDark/luci-app-microproxy/main"

echo "=== Starting Luci-App-MicroProxy Installation ==="

# Check for internet connection and curl/wget
if ! which curl >/dev/null 2>&1 && ! which wget >/dev/null 2>&1; then
	echo "Error: Neither curl nor wget is installed! Please run 'opkg update && opkg install curl' first."
	exit 1
fi

# Install dependencies automatically
echo "Updating package repository..."
opkg update

echo "Installing system dependencies (sing-box, nftables, curl)..."
opkg install sing-box nftables curl


# Download utility helper
download_file() {
	local src="$1"
	local dst="$2"
	echo "Downloading $dst..."
	if which curl >/dev/null 2>&1; then
		curl -s -L -k -o "$dst" "$REPO_URL/$src"
	else
		wget -q -O "$dst" --no-check-certificate "$REPO_URL/$src"
	fi
	if [ $? -ne 0 ]; then
		echo "Error: Failed to download $src!"
		exit 1
	fi
}

# Create necessary directories on the router
echo "Creating directories..."
mkdir -p /etc/config
mkdir -p /etc/init.d
mkdir -p /etc/uci-defaults
mkdir -p /usr/share/microproxy
mkdir -p /usr/share/luci/menu.d
mkdir -p /usr/share/rpcd/acl.d
mkdir -p /www/luci-static/resources/view/microproxy

# Download package files
download_file "Makefile" "/tmp/Makefile.microproxy"
download_file "root/etc/config/microproxy" "/etc/config/microproxy"
download_file "root/etc/init.d/microproxy" "/etc/init.d/microproxy"
download_file "root/etc/uci-defaults/luci-app-microproxy" "/etc/uci-defaults/luci-app-microproxy"
download_file "root/usr/share/microproxy/update_lists.sh" "/usr/share/microproxy/update_lists.sh"
download_file "root/usr/share/microproxy/update_vless_sub.sh" "/usr/share/microproxy/update_vless_sub.sh"
download_file "root/usr/share/luci/menu.d/luci-app-microproxy.json" "/usr/share/luci/menu.d/luci-app-microproxy.json"
download_file "root/usr/share/rpcd/acl.d/luci-app-microproxy.json" "/usr/share/rpcd/acl.d/luci-app-microproxy.json"
download_file "root/www/luci-static/resources/microproxy.css" "/www/luci-static/resources/microproxy.css"
download_file "root/www/luci-static/resources/view/microproxy/overview.js" "/www/luci-static/resources/view/microproxy/overview.js"
download_file "root/www/luci-static/resources/view/microproxy/servers.js" "/www/luci-static/resources/view/microproxy/servers.js"
download_file "root/www/luci-static/resources/view/microproxy/routing.js" "/www/luci-static/resources/view/microproxy/routing.js"
download_file "root/www/luci-static/resources/view/microproxy/advanced.js" "/www/luci-static/resources/view/microproxy/advanced.js"

# Set executable permissions
echo "Applying file permissions and defaults..."
chmod +x /etc/init.d/microproxy
chmod +x /usr/share/microproxy/update_lists.sh
chmod +x /usr/share/microproxy/update_vless_sub.sh

# Run post-install configurations
sh /etc/uci-defaults/luci-app-microproxy
rm -f /etc/uci-defaults/luci-app-microproxy

# Reload system web services to register new LuCI menu and ACL rules
echo "Restarting web and security daemons..."
/etc/init.d/rpcd restart
/etc/init.d/uhttpd restart

echo "=== Installation Completed Successfully! ==="
echo "Please refresh your OpenWrt LuCI browser tab. You can now configure MicroProxy in 'Services' -> 'MicroProxy'."
