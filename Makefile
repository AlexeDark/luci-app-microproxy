include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-microproxy
PKG_VERSION:=1.0.0
PKG_RELEASE:=1
PKG_LICENSE:=MIT
PKG_MAINTAINER:=Senior Embedded System Engineer

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-microproxy
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=LuCI support for lightweight Sing-box Reality proxy
  DEPENDS:=+luci-base +sing-box +nftables +curl
  PKGARCH:=all
endef

define Build/Compile
endef

define Package/luci-app-microproxy/install
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/microproxy

	# Copy all files from root to the root of the package build dir
	$(CP) ./root/* $(1)/
endef

$(eval $(call BuildPackage,luci-app-microproxy))
