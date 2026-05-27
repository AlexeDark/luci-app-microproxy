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

echo "Installing base system dependencies (nftables, curl)..."
opkg install nftables curl

# Try to install default sing-box package to ensure any system configurations are created
opkg install sing-box

# Upgrade Sing-box if missing or too old (< 1.9.0)
SB_VER_NEED="1.9.3"
SB_UPGRADE=0

if ! which sing-box >/dev/null 2>&1; then
	echo "Sing-box is not installed."
	SB_UPGRADE=1
else
	SB_CURRENT_VER=$(sing-box version 2>&1 | grep -o -E "version [0-9.]+" | cut -d' ' -f2 | head -n1)
	echo "Current Sing-box version: $SB_CURRENT_VER"
	
	MAJOR=$(echo "$SB_CURRENT_VER" | cut -d'.' -f1)
	MINOR=$(echo "$SB_CURRENT_VER" | cut -d'.' -f2)
	
	if [ -z "$MAJOR" ] || [ -z "$MINOR" ]; then
		SB_UPGRADE=1
	elif [ "$MAJOR" -lt 1 ]; then
		SB_UPGRADE=1
	elif [ "$MAJOR" -eq 1 ] && [ "$MINOR" -lt 9 ]; then
		SB_UPGRADE=1
	fi
fi

if [ "$SB_UPGRADE" -eq 1 ]; then
	echo "Your system has an outdated or missing Sing-box version (< 1.9.0)."
	ARCH=$(uname -m)
	SB_ARCH=""
	case "$ARCH" in
		x86_64)
			SB_ARCH="amd64"
			;;
		aarch64|arm64)
			SB_ARCH="arm64"
			;;
		armv7*)
			SB_ARCH="armv7"
			;;
		mips)
			SB_ARCH="mips"
			;;
		mipsel)
			SB_ARCH="mipsle"
			;;
		*)
			OPKG_ARCH=$(opkg print-architecture | awk 'NR==1 {print $2}')
			case "$OPKG_ARCH" in
				x86_64) SB_ARCH="amd64" ;;
				aarch64*|arm64*) SB_ARCH="arm64" ;;
				arm_cortex*) SB_ARCH="armv7" ;;
				mipsel*) SB_ARCH="mipsle" ;;
				mips*) SB_ARCH="mips" ;;
			esac
			;;
	esac
	
	if [ -n "$SB_ARCH" ]; then
		tar_file="sing-box-${SB_VER_NEED}-linux-${SB_ARCH}.tar.gz"
		url="https://github.com/SagerNet/sing-box/releases/download/v${SB_VER_NEED}/${tar_file}"
		echo "Downloading official Sing-box ($SB_ARCH) v${SB_VER_NEED}..."
		if which curl >/dev/null 2>&1; then
			curl -s -L -k -o "/tmp/$tar_file" "$url"
		else
			wget -q -O "/tmp/$tar_file" --no-check-certificate "$url"
		fi
		
		if [ $? -eq 0 ] && [ -f "/tmp/$tar_file" ]; then
			echo "Extracting Sing-box binary..."
			mkdir -p /tmp/sb_extract
			tar -C /tmp/sb_extract -zxf "/tmp/$tar_file" 2>/dev/null
			
			local_sb="/tmp/sb_extract/sing-box-${SB_VER_NEED}-linux-${SB_ARCH}/sing-box"
			if [ -f "$local_sb" ]; then
				sb_path="/usr/bin/sing-box"
				if [ -f "/usr/sbin/sing-box" ]; then
					sb_path="/usr/sbin/sing-box"
				fi
				echo "Installing official Sing-box binary to $sb_path..."
				mv "$local_sb" "$sb_path"
				chmod +x "$sb_path"
				echo "Sing-box successfully upgraded!"
			else
				echo "Error: Extract failed, binary not found."
			fi
			rm -rf /tmp/sb_extract "/tmp/$tar_file"
		else
			echo "Warning: Failed to download official Sing-box binary. Keeping opkg version."
		fi
	else
		echo "Warning: Unsupported architecture ($ARCH) for official precompiled binary upgrade."
	fi
fi


# Download utility helper
download_file() {
	local src="$1"
	local dst="$2"
	local buster=$(date +%s)
	echo "Downloading $dst..."
	if which curl >/dev/null 2>&1; then
		curl -s -L -k -o "$dst" "$REPO_URL/$src?t=$buster"
	else
		wget -q -O "$dst" --no-check-certificate "$REPO_URL/$src?t=$buster"
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
