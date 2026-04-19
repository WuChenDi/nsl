use super::*;
use std::collections::BTreeMap;

#[test]
fn test_default_config() {
    let config = Config::default();
    assert_eq!(config.proxy_port, 1355);
    assert!(!config.proxy_https);
    assert_eq!(config.max_hops, 5);
    assert_eq!(config.domains, vec!["localhost".to_string()]);
    assert_eq!(config.app_port_range, (3000, 9999));
    assert!(!config.app_force);
    assert!(config.state_dir.is_none());
}

#[test]
fn test_raw_config_resolve_defaults() {
    let raw = RawConfig::default();
    let config = raw.resolve();
    assert_eq!(config.proxy_port, 1355);
    assert!(!config.proxy_https);
}

#[test]
fn test_raw_config_resolve_overrides() {
    let raw = RawConfig {
        proxy: Some(RawProxy {
            port: Some(8080),
            https: Some(true),
            ..Default::default()
        }),
        ..Default::default()
    };
    let config = raw.resolve();
    assert_eq!(config.proxy_port, 8080);
    assert!(config.proxy_https);
    assert_eq!(config.max_hops, 5); // default
}

#[test]
fn test_merge_both_present() {
    let base = RawConfig {
        proxy: Some(RawProxy {
            port: Some(1355),
            https: Some(false),
            max_hops: Some(3),
            ..Default::default()
        }),
        ..Default::default()
    };
    let overlay = RawConfig {
        proxy: Some(RawProxy {
            port: Some(8080),
            ..Default::default()
        }),
        app: Some(RawApp {
            force: Some(true),
            ..Default::default()
        }),
        ..Default::default()
    };
    let merged = base.merge(overlay).resolve();
    assert_eq!(merged.proxy_port, 8080); // overlay wins
    assert!(!merged.proxy_https); // base kept
    assert_eq!(merged.max_hops, 3); // base kept
    assert!(merged.app_force); // overlay added
}

#[test]
fn test_merge_only_base() {
    let base = RawConfig {
        proxy: Some(RawProxy {
            port: Some(9090),
            ..Default::default()
        }),
        ..Default::default()
    };
    let merged = base.merge(RawConfig::default()).resolve();
    assert_eq!(merged.proxy_port, 9090);
    assert_eq!(merged.domains, vec!["localhost".to_string()]); // default preserved
}

#[test]
fn test_merge_only_overlay() {
    let overlay = RawConfig {
        app: Some(RawApp {
            force: Some(true),
            ..Default::default()
        }),
        ..Default::default()
    };
    let merged = RawConfig::default().merge(overlay).resolve();
    assert!(merged.app_force);
}

#[test]
fn test_load_config_file_missing() {
    let result = load_config_file(Path::new("/nonexistent/config.toml"));
    assert!(result.is_none());
}

#[test]
fn test_load_config_file_valid() {
    let tmp = tempfile::TempDir::new().unwrap();
    let config_path = tmp.path().join("config.toml");
    fs::write(
        &config_path,
        r#"
[proxy]
port = 4000
https = true

[app]
force = true
"#,
    )
    .unwrap();

    let raw = load_config_file(&config_path).unwrap();
    let config = raw.resolve();
    assert_eq!(config.proxy_port, 4000);
    assert!(config.proxy_https);
    assert!(config.app_force);
}

#[test]
fn test_load_config_file_invalid_toml() {
    let tmp = tempfile::TempDir::new().unwrap();
    let config_path = tmp.path().join("config.toml");
    fs::write(&config_path, "not valid [[[ toml").unwrap();

    let result = load_config_file(&config_path);
    assert!(result.is_none());
}

#[test]
fn test_find_project_config() {
    let tmp = tempfile::TempDir::new().unwrap();
    let sub = tmp.path().join("a").join("b");
    fs::create_dir_all(&sub).unwrap();
    fs::write(tmp.path().join("nsl.toml"), "[proxy]\nport = 7777\n").unwrap();

    let found = find_project_config(&sub);
    assert_eq!(found.unwrap(), tmp.path().join("nsl.toml"));
}

#[test]
fn test_find_project_config_not_found() {
    let tmp = tempfile::TempDir::new().unwrap();
    let found = find_project_config(tmp.path());
    assert!(found.is_none());
}

#[test]
fn test_config_resolve_state_dir_explicit() {
    let config = Config {
        state_dir: Some(PathBuf::from("/custom/state")),
        ..Default::default()
    };
    assert_eq!(config.resolve_state_dir(), PathBuf::from("/custom/state"));
}

#[test]
fn test_custom_domains_config() {
    let raw = RawConfig {
        proxy: Some(RawProxy {
            domains: Some(vec!["dev.local".to_string(), "test".to_string()]),
            ..Default::default()
        }),
        ..Default::default()
    };
    let config = raw.resolve();
    // `localhost` is always implicitly included (prepended if user omitted it).
    assert_eq!(
        config.domains,
        vec![
            "localhost".to_string(),
            "dev.local".to_string(),
            "test".to_string(),
        ]
    );
}

#[test]
fn test_localhost_always_present_even_if_user_omits() {
    let raw = RawConfig {
        proxy: Some(RawProxy {
            domains: Some(vec!["myapp.com".to_string()]),
            ..Default::default()
        }),
        ..Default::default()
    };
    let config = raw.resolve();
    assert!(config.domains.contains(&"localhost".to_string()));
    assert!(config.domains.contains(&"myapp.com".to_string()));
}

#[test]
fn test_localhost_not_duplicated_if_user_included_it() {
    let raw = RawConfig {
        proxy: Some(RawProxy {
            domains: Some(vec!["localhost".to_string(), "myapp.com".to_string()]),
            ..Default::default()
        }),
        ..Default::default()
    };
    let config = raw.resolve();
    let localhost_count = config.domains.iter().filter(|d| *d == "localhost").count();
    assert_eq!(localhost_count, 1);
}

#[test]
fn test_domain_display_resolves_defaults() {
    let mut domain = BTreeMap::new();
    domain.insert(
        "myapp.com".to_string(),
        RawDomainDisplay {
            https: None,
            port: None,
        },
    );
    let raw = RawConfig {
        proxy: Some(RawProxy {
            domains: Some(vec!["myapp.com".to_string()]),
            domain: Some(domain),
            ..Default::default()
        }),
        ..Default::default()
    };
    let config = raw.resolve();
    assert_eq!(config.domain_displays.len(), 1);
    assert_eq!(config.domain_displays[0].suffix, "myapp.com");
    assert!(config.domain_displays[0].https);
    assert!(config.domain_displays[0].port.is_none());
}

#[test]
fn test_domain_display_from_toml() {
    let tmp = tempfile::TempDir::new().unwrap();
    let config_path = tmp.path().join("config.toml");
    fs::write(
        &config_path,
        r#"
[proxy]
domains = ["myapp.com"]

[proxy.domain."myapp.com"]
https = true

[proxy.domain."dev.internal"]
https = false
port = 8080
"#,
    )
    .unwrap();

    let raw = load_config_file(&config_path).unwrap();
    let config = raw.resolve();
    assert_eq!(config.domain_displays.len(), 2);
    // BTreeMap orders keys alphabetically: "dev.internal" < "myapp.com"
    let dev = config
        .domain_displays
        .iter()
        .find(|d| d.suffix == "dev.internal")
        .unwrap();
    assert!(!dev.https);
    assert_eq!(dev.port, Some(8080));
    let myapp = config
        .domain_displays
        .iter()
        .find(|d| d.suffix == "myapp.com")
        .unwrap();
    assert!(myapp.https);
    assert!(myapp.port.is_none());
}

#[test]
fn test_domains_merge_overlay_wins() {
    let base = RawConfig {
        proxy: Some(RawProxy {
            domains: Some(vec!["localhost".to_string()]),
            ..Default::default()
        }),
        ..Default::default()
    };
    let overlay = RawConfig {
        proxy: Some(RawProxy {
            domains: Some(vec!["dev.local".to_string(), "localhost".to_string()]),
            ..Default::default()
        }),
        ..Default::default()
    };
    let config = base.merge(overlay).resolve();
    assert_eq!(
        config.domains,
        vec!["dev.local".to_string(), "localhost".to_string()]
    );
}

#[test]
fn test_load_config_file_with_domains() {
    let tmp = tempfile::TempDir::new().unwrap();
    let config_path = tmp.path().join("config.toml");
    fs::write(
        &config_path,
        r#"
[proxy]
port = 1355
domains = ["dev.local", "localhost", "test"]
"#,
    )
    .unwrap();

    let raw = load_config_file(&config_path).unwrap();
    let config = raw.resolve();
    assert_eq!(
        config.domains,
        vec![
            "dev.local".to_string(),
            "localhost".to_string(),
            "test".to_string(),
        ]
    );
}

#[test]
fn test_default_bind_is_loopback() {
    let config = Config::default();
    assert_eq!(config.proxy_bind, IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1)));
}

#[test]
fn test_bind_config_any_address() {
    let raw = RawConfig {
        proxy: Some(RawProxy {
            bind: Some("0.0.0.0".to_string()),
            ..Default::default()
        }),
        ..Default::default()
    };
    let config = raw.resolve();
    assert_eq!(config.proxy_bind, IpAddr::V4(Ipv4Addr::new(0, 0, 0, 0)));
}

#[test]
fn test_bind_invalid_falls_back_to_default() {
    let raw = RawConfig {
        proxy: Some(RawProxy {
            bind: Some("not-an-ip".to_string()),
            ..Default::default()
        }),
        ..Default::default()
    };
    let config = raw.resolve();
    assert_eq!(config.proxy_bind, IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1)));
}

#[test]
fn test_config_resolve_state_dir_privileged_port() {
    let config = Config {
        proxy_port: 80,
        state_dir: None,
        ..Default::default()
    };
    assert_eq!(config.resolve_state_dir(), PathBuf::from("/tmp/nsl"));
}
