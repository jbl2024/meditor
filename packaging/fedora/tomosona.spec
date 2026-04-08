Name:           tomosona
Version:        __PKGVER__
Release:        1%{?dist}
Summary:        Local-first markdown editor

License:        MIT
URL:            https://github.com/jbl2024/tomosona
Source0:        %{name}-%{version}.tar.gz

BuildRequires:  cargo
BuildRequires:  gcc
BuildRequires:  git
BuildRequires:  gtk3-devel
BuildRequires:  hicolor-icon-theme
BuildRequires:  libappindicator-gtk3-devel
BuildRequires:  librsvg2-devel
BuildRequires:  make
BuildRequires:  openssl-devel
BuildRequires:  nodejs
BuildRequires:  npm
BuildRequires:  pkgconf-pkg-config
BuildRequires:  rust
BuildRequires:  webkit2gtk4.1-devel
BuildRequires:  xdg-utils

Requires:       gtk3
Requires:       libappindicator-gtk3
Requires:       librsvg2
Requires:       webkit2gtk4.1
Requires:       xdg-utils

%global debug_package %{nil}

%description
Local-first markdown editor.

%prep
%autosetup

%build
npm ci
AWS_LC_SYS_NO_JITTER_ENTROPY=1 npm run tauri:build -- --no-bundle

%install
install -Dm755 src-tauri/target/release/tomosona %{buildroot}%{_bindir}/tomosona
install -Dm644 packaging/fedora/tomosona.desktop %{buildroot}%{_datadir}/applications/tomosona.desktop
install -Dm644 src-tauri/icons/icon.png %{buildroot}%{_datadir}/icons/hicolor/512x512/apps/tomosona.png
install -Dm644 LICENSE %{buildroot}%{_licensedir}/%{name}/LICENSE

%files
%license %{_licensedir}/%{name}/LICENSE
%{_bindir}/tomosona
%{_datadir}/applications/tomosona.desktop
%{_datadir}/icons/hicolor/512x512/apps/tomosona.png
