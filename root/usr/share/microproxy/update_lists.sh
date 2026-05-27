#!/bin/sh
# Lightweight subscription updater for luci-app-microproxy
# Written by Senior Embedded System Engineer

. /lib/functions.sh

DIR="/var/etc/microproxy"
mkdir -p "$DIR"

# Temporary files
TMP_DOMAINS="$DIR/tmp_domains.txt"
TMP_IPS="$DIR/tmp_ips.txt"
true > "$TMP_DOMAINS"
true > "$TMP_IPS"

# Function to parse downloaded lists
parse_list() {
	local filepath="$1"
	# Separate domains and IPs/CIDRs
	awk '
	# Skip comments and empty lines
	/^[[:space:]]*#/ { next }
	/^[[:space:]]*$/ { next }
	{
		# Strip leading/trailing whitespaces
		gsub(/^[[:space:]]+|[[:space:]]+$/, "", $0)
		
		# Simple check for IPv4 or CIDR
		if ($0 ~ /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+(\/[0-9]+)?$/) {
			print $0 > "'"$TMP_IPS"'"
		} else {
			print $0 > "'"$TMP_DOMAINS"'"
		}
	}' "$filepath"
}

# Function to compile domains list to Sing-box source rule-set JSON
compile_domains_json() {
	local infile="$1"
	local outfile="$2"
	
	awk '
	BEGIN {
		print "{"
		print "  \"version\": 1,"
		print "  \"rules\": ["
		print "    {"
		print "      \"domain\": ["
		comma = ""
	}
	{
		# Double check it is a valid domain-like string
		if ($0 ~ /^[a-zA-Z0-9.-]+$/) {
			if (comma != "") print comma
			printf "        \"%s\"", $0
			comma = ","
		}
	}
	END {
		print ""
		print "      ]"
		print "    }"
		print "  ]"
		print "}"
	}' "$infile" > "$outfile"
}

update_subscription() {
	local section="$1"
	local enabled name url format
	
	config_get_bool enabled "$section" enabled 0
	[ "$enabled" -eq 0 ] && return
	
	config_get name "$section" name "Subscription"
	config_get url "$section" url
	config_get format "$section" format "text"
	
	[ -z "$url" ] && return
	
	echo "Downloading subscription '$name' from $url..."
	local tmp_file="$DIR/download_tmp"
	
	# Download with curl
	curl -L -s -k --connect-timeout 10 --max-time 60 -o "$tmp_file" "$url"
	if [ $? -ne 0 ] || [ ! -s "$tmp_file" ]; then
		echo "Failed to download '$name'!"
		rm -f "$tmp_file"
		return 1
	fi
	
	if [ "$format" = "srs" ]; then
		# Binary rule-set for Sing-box: save directly
		mv "$tmp_file" "$DIR/$section.srs"
		echo "Saved binary rule-set: $section.srs"
	else
		# Text format: parse and merge
		parse_list "$tmp_file"
		rm -f "$tmp_file"
	fi
}

echo "Starting microproxy list update..."
config_load microproxy
config_foreach update_subscription "subscription"

# Add custom rules from UCI if any
append_custom_rules() {
	local section="$1"
	
	add_domain() {
		echo "$1" >> "$TMP_DOMAINS"
	}
	add_ip() {
		echo "$1" >> "$TMP_IPS"
	}
	
	config_list_foreach "$section" domain add_domain
	config_list_foreach "$section" ip add_ip
}
config_foreach append_custom_rules "custom_rules"

# Compile and update Whitelist domains
if [ -s "$TMP_DOMAINS" ]; then
	sort -u "$TMP_DOMAINS" > "$DIR/domains_clean.txt"
	compile_domains_json "$DIR/domains_clean.txt" "$DIR/whitelist_domains.json"
	echo "Compiled domains to Sing-box rule-set: $DIR/whitelist_domains.json ($(wc -l < "$DIR/domains_clean.txt") domains)"
	rm -f "$DIR/domains_clean.txt"
else
	# Create empty rule-set if none
	echo '{"version": 1, "rules": [{"domain": []}]}' > "$DIR/whitelist_domains.json"
fi

# Update Whitelist IPs in nftables if running
if [ -s "$TMP_IPS" ]; then
	sort -u "$TMP_IPS" > "$DIR/whitelist_ips.list"
	echo "Saved IP list: $DIR/whitelist_ips.list ($(wc -l < "$DIR/whitelist_ips.list") IPs)"
	
	# If service is active, reload IPs into nftables set instantly
	if nft list set inet nft_microproxy whitelist_ips >/dev/null 2>&1; then
		echo "Hot-loading IPs into nftables set..."
		# Flush old set elements
		nft flush set inet nft_microproxy whitelist_ips
		# Add new elements in chunks
		while read -r ip; do
			[ -n "$ip" ] && nft add element inet nft_microproxy whitelist_ips { "$ip" }
		done < "$DIR/whitelist_ips.list"
	fi
else
	true > "$DIR/whitelist_ips.list"
	if nft list set inet nft_microproxy whitelist_ips >/dev/null 2>&1; then
		nft flush set inet nft_microproxy whitelist_ips
	fi
fi

rm -f "$TMP_DOMAINS" "$TMP_IPS"
echo "Microproxy list update completed successfully!"
