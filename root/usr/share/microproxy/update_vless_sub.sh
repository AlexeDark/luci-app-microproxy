#!/bin/sh
# Native VLESS Subscription Updater for luci-app-microproxy
# Written by Senior Embedded System Engineer
# Works exactly like PassWall subscription sync

. /lib/functions.sh

CONF_FILE="/etc/config/microproxy"

# Base64 decoder helper
decode_base64() {
	if which base64 >/dev/null 2>&1; then
		tr -d '\n\r ' | base64 -d 2>/dev/null
	elif which openssl >/dev/null 2>&1; then
		tr -d '\n\r ' | openssl enc -d -base64 2>/dev/null
	else
		tr -d '\n\r '
	fi
}

# Parse query string helpers for POSIX shell
get_query_val() {
	local query="$1"
	local key="$2"
	echo "$query" | grep -o -E "(^|&)$key=[^&]*" | cut -d'=' -f2 | head -n1
}

url_decode() {
	local val="$1"
	local prep=$(echo "$val" | sed 's/+/ /g;s/%\([0-9a-fA-F][0-9a-fA-F]\)/\\x\1/g')
	printf "%b" "$prep"
}

# Parse a single vless:// link and write to UCI
parse_vless_link() {
	local link="$1"
	local sub_id="$2"
	
	# Strip protocol prefix
	local raw="${link#vless://}"
	
	# Extract alias (everything after '#')
	local alias="VLESS Node"
	if [ "$raw" != "${raw%#*}" ]; then
		alias="${raw#*#}"
		raw="${raw%#*}"
		alias=$(url_decode "$alias")
	fi
	
	# Extract UUID (everything before '@')
	local uuid="${raw%%@*}"
	local rest="${raw#*@}"
	
	# Extract server & port (between '@' and '?')
	local server_port=""
	local query=""
	if [ "$rest" != "${rest%\?*}" ]; then
		server_port="${rest%%\?*}"
		query="${rest#*\?}"
	else
		server_port="$rest"
	fi
	
	local server=""
	local port="443"
	if echo "$server_port" | grep -q "\]"; then
		# IPv6 address in brackets, e.g. [2001:db8::1]:443 or [2001:db8::1]
		server=$(echo "$server_port" | cut -d']' -f1 | tr -d '[')
		local port_part=$(echo "$server_port" | cut -d']' -f2)
		if [ -n "$port_part" ]; then
			port="${port_part#:}"
		fi
	else
		# IPv4 or domain, e.g. 1.2.3.4:443 or domain.com:443 or domain.com
		if echo "$server_port" | grep -q ":"; then
			server="${server_port%%:*}"
			port="${server_port#*:}"
		else
			server="$server_port"
			port="443"
		fi
	fi
	
	# Parse query params
	local flow="" transport="tcp" tls="0" sni="" pbk="" sid=""
	
	# Extract Reality/TLS/XHTTP properties from query string
	flow=$(get_query_val "$query" "flow")
	transport=$(get_query_val "$query" "type")
	[ -z "$transport" ] && transport="tcp"
	
	local security=$(get_query_val "$query" "security")
	[ "$security" = "reality" ] && tls="1"
	
	sni=$(get_query_val "$query" "sni")
	pbk=$(get_query_val "$query" "pbk")
	sid=$(get_query_val "$query" "sid")
	
	# URL decode parameters
	[ -n "$sni" ] && sni=$(url_decode "$sni")
	[ -n "$pbk" ] && pbk=$(url_decode "$pbk")
	[ -n "$sid" ] && sid=$(url_decode "$sid")
	
	# Add new server section in UCI
	local node_id=$(uci add microproxy server)
	uci set microproxy.$node_id.enabled='1'
	uci set microproxy.$node_id.alias="$alias"
	uci set microproxy.$node_id.type='vless'
	uci set microproxy.$node_id.server="$server"
	uci set microproxy.$node_id.server_port="$port"
	uci set microproxy.$node_id.uuid="$uuid"
	uci set microproxy.$node_id.flow="$flow"
	uci set microproxy.$node_id.transport="$transport"
	uci set microproxy.$node_id.tls="$tls"
	uci set microproxy.$node_id.server_name="$sni"
	uci set microproxy.$node_id.public_key="$pbk"
	uci set microproxy.$node_id.short_id="$sid"
	uci set microproxy.$node_id.subscribe_group="$sub_id"
	
	# Enforce obfuscation for Reality XHTTP
	if [ "$transport" = "xhttp" ]; then
		uci set microproxy.$node_id.xhttp_mode="packet"
		uci set microproxy.$node_id.xhttp_padding="100-1000"
	fi
}

# Delete all old servers belonging to this subscription group
delete_old_servers() {
	local sub_id="$1"
	
	# Get all sections of type 'server'
	local sections=$(uci show microproxy | grep "=server" | cut -d'.' -f2 | cut -d'=' -f1)
	for s in $sections; do
		local group=$(uci -q get microproxy.$s.subscribe_group)
		if [ "$group" = "$sub_id" ]; then
			uci delete microproxy.$s
		fi
	done
}

update_subscription() {
	local section="$1"
	local enabled name url
	
	config_get_bool enabled "$section" enabled 0
	[ "$enabled" -eq 0 ] && return
	
	config_get name "$section" name "Subscription"
	config_get url "$section" url
	
	[ -z "$url" ] && return
	
	echo "Updating VLESS subscription '$name'..."
	
	# 1. Download list
	local raw_data=$(curl -s -L -k --connect-timeout 10 --max-time 30 "$url")
	if [ $? -ne 0 ] || [ -z "$raw_data" ]; then
		echo "Error: Failed to download subscription '$name'!"
		return 1
	fi
	
	# 2. Decode Base64 if needed
	local decoded_data=""
	if echo "$raw_data" | grep -q "^vless://"; then
		echo "Subscription data is plain text."
		decoded_data="$raw_data"
	else
		echo "Subscription data appears to be Base64 encoded. Decoding..."
		decoded_data=$(printf '%s\n' "$raw_data" | decode_base64)
		if [ -z "$decoded_data" ] || ! echo "$decoded_data" | grep -q "vless://"; then
			echo "Base64 decoding failed or no vless:// links found. Falling back to raw data."
			decoded_data="$raw_data"
		fi
	fi
	
	# 3. Clean up previously imported servers of this group
	delete_old_servers "$section"
	
	# 4. Parse links and write to UCI
	local imported_count=0
	
	# Loop through lines using IFS (literal newline for POSIX sh)
	local IFS_old="$IFS"
	IFS="
"
	for line in $decoded_data; do
		# Remove carriage returns
		line=$(echo "$line" | tr -d '\r' | xargs)
		if [ -n "$line" ] && [ "${line#vless://}" != "$line" ]; then
			parse_vless_link "$line" "$section"
			imported_count=$((imported_count + 1))
		fi
	done
	IFS="$IFS_old"
	
	echo "Successfully imported $imported_count servers from '$name'!"
}

echo "Starting VLESS Subscription Sync..."

config_load microproxy
config_foreach update_subscription "server_subscription"

# Commit UCI changes
uci commit microproxy

# Restart proxy service to apply new outbounds
if /etc/init.d/microproxy enabled; then
	echo "Reloading microproxy service..."
	/etc/init.d/microproxy reload
fi

echo "VLESS Subscription Sync finished!"
