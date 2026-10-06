//! Fichiers de version Mojang (`<version>.json`) et profils Fabric qui en héritent.
//!
//! Format : https://minecraft.wiki/w/Client.json. Les règles filtrent bibliothèques et arguments
//! selon le système, l'architecture et les « features » demandées par le launcher.

use std::collections::HashSet;

use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionJson {
    pub id: String,
    pub main_class: Option<String>,
    pub minecraft_arguments: Option<String>,
    #[serde(default)]
    pub arguments: Arguments,
    #[serde(default)]
    pub libraries: Vec<Library>,
    pub asset_index: Option<AssetIndexRef>,
    pub downloads: Option<VersionDownloads>,
    pub java_version: Option<JavaVersion>,
    pub logging: Option<Logging>,
    #[serde(rename = "type")]
    pub kind: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
pub struct Arguments {
    #[serde(default)]
    pub game: Vec<Argument>,
    #[serde(default)]
    pub jvm: Vec<Argument>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum Argument {
    Plain(String),
    Conditional { rules: Vec<Rule>, value: OneOrMany },
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum OneOrMany {
    One(String),
    Many(Vec<String>),
}

#[derive(Debug, Deserialize)]
pub struct Rule {
    action: Action,
    os: Option<OsRule>,
    #[serde(default)]
    features: std::collections::HashMap<String, bool>,
}

#[derive(Debug, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
enum Action {
    Allow,
    Disallow,
}

#[derive(Debug, Deserialize)]
struct OsRule {
    name: Option<String>,
    arch: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct Library {
    pub name: String,
    pub downloads: Option<LibraryDownloads>,
    /// Profils Fabric : base Maven, le chemin se déduit de `name`.
    pub url: Option<String>,
    pub sha1: Option<String>,
    pub size: Option<u64>,
    #[serde(default)]
    pub natives: std::collections::HashMap<String, String>,
    pub extract: Option<Extraction>,
    #[serde(default)]
    pub rules: Vec<Rule>,
}

#[derive(Debug, Deserialize)]
pub struct LibraryDownloads {
    pub artifact: Option<Artifact>,
    #[serde(default)]
    pub classifiers: std::collections::HashMap<String, Artifact>,
}

#[derive(Debug, Deserialize)]
pub struct Extraction {
    #[serde(default)]
    pub exclude: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct Artifact {
    pub path: Option<String>,
    pub url: String,
    pub sha1: Option<String>,
    pub size: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub struct AssetIndexRef {
    pub id: String,
    pub url: String,
    pub sha1: String,
    /// Taille de tous les objets de l'index, pour annoncer le téléchargement.
    #[serde(default, rename = "totalSize")]
    pub total_size: u64,
    pub size: u64,
}

#[derive(Debug, Deserialize)]
pub struct VersionDownloads {
    pub client: Artifact,
}

#[derive(Debug, Deserialize)]
pub struct JavaVersion {
    pub component: String,
}

#[derive(Debug, Deserialize)]
pub struct Logging {
    pub client: Option<LoggingClient>,
}

#[derive(Debug, Deserialize)]
pub struct LoggingClient {
    /// Contient `${path}`, remplacé par le chemin du fichier de configuration.
    pub argument: String,
    pub file: LoggingFile,
}

#[derive(Debug, Deserialize)]
pub struct LoggingFile {
    pub id: String,
    pub url: String,
    pub sha1: String,
    pub size: u64,
}

/// Bibliothèque prête à télécharger : chemin relatif au dossier `libraries/`.
#[derive(Debug, PartialEq)]
pub struct ResolvedLibrary {
    pub path: String,
    pub url: String,
    pub sha1: Option<String>,
    pub size: Option<u64>,
}

const OS_NAME: &str = if cfg!(windows) {
    "windows"
} else if cfg!(target_os = "macos") {
    "osx"
} else {
    "linux"
};

fn mojang_arch() -> &'static str {
    match std::env::consts::ARCH {
        "x86_64" => "x86_64",
        "aarch64" => "arm64",
        other => other,
    }
}

impl Rule {
    fn matches(&self, features: &[&str]) -> bool {
        let os_matches = self.os.as_ref().is_none_or(|os| {
            os.name.as_deref().is_none_or(|name| name == OS_NAME)
                && os.arch.as_deref().is_none_or(|arch| arch == mojang_arch())
        });
        os_matches
            && self
                .features
                .iter()
                .all(|(feature, expected)| features.contains(&feature.as_str()) == *expected)
    }
}

/// La dernière règle applicable l'emporte ; sans règle, tout est permis.
pub fn allowed(rules: &[Rule], features: &[&str]) -> bool {
    if rules.is_empty() {
        return true;
    }
    rules
        .iter()
        .rev()
        .find(|rule| rule.matches(features))
        .is_some_and(|rule| rule.action == Action::Allow)
}

pub fn expand(arguments: &[Argument], features: &[&str]) -> Vec<String> {
    let mut expanded = Vec::new();
    for argument in arguments {
        match argument {
            Argument::Plain(value) => expanded.push(value.clone()),
            Argument::Conditional { rules, value } if allowed(rules, features) => match value {
                OneOrMany::One(value) => expanded.push(value.clone()),
                OneOrMany::Many(values) => expanded.extend(values.iter().cloned()),
            },
            Argument::Conditional { .. } => {}
        }
    }
    expanded
}

impl Library {
    pub fn native(&self) -> Option<ResolvedLibrary> {
        let classifier = self.natives.get(OS_NAME)?.replace("${arch}", if cfg!(target_pointer_width = "64") { "64" } else { "32" });
        let artifact = self.downloads.as_ref()?.classifiers.get(&classifier)?;
        Some(ResolvedLibrary { path: artifact.path.clone().or_else(|| maven_path(&format!("{}:{classifier}", self.name)))?, url: artifact.url.clone(), sha1: artifact.sha1.clone(), size: artifact.size })
    }
    pub fn resolve(&self) -> Option<ResolvedLibrary> {
        if let Some(artifact) = self.downloads.as_ref().and_then(|d| d.artifact.as_ref()) {
            return Some(ResolvedLibrary {
                path: artifact.path.clone().or_else(|| maven_path(&self.name))?,
                url: artifact.url.clone(),
                sha1: artifact.sha1.clone(),
                size: artifact.size,
            });
        }
        let base = self.url.as_deref()?;
        let path = maven_path(&self.name)?;
        Some(ResolvedLibrary {
            url: format!("{}/{path}", base.trim_end_matches('/')),
            path,
            sha1: self.sha1.clone(),
            size: self.size,
        })
    }

    /// `groupe:artefact[:classifier]`, sans la version : deux entrées de même clé sont la même
    /// bibliothèque.
    fn key(&self) -> String {
        let parts: Vec<&str> = self.name.split(':').collect();
        match parts.as_slice() {
            [group, artifact, _version, classifier, ..] => format!("{group}:{artifact}:{classifier}"),
            [group, artifact, ..] => format!("{group}:{artifact}"),
            _ => self.name.clone(),
        }
    }
}

/// Bibliothèques du profil enfant (Fabric) d'abord, puis celles du parent qu'il ne remplace pas.
pub fn merge_libraries<'a>(child: &'a [Library], parent: &'a [Library]) -> Vec<&'a Library> {
    let overridden: HashSet<String> = child.iter().map(Library::key).collect();
    child
        .iter()
        .chain(parent.iter().filter(|library| !overridden.contains(&library.key())))
        .collect()
}

/// `groupe:artefact:version[:classifier][@extension]` → chemin Maven relatif.
fn maven_path(name: &str) -> Option<String> {
    let (coordinates, extension) = name.split_once('@').unwrap_or((name, "jar"));
    let parts: Vec<&str> = coordinates.split(':').collect();
    let (group, artifact, version, classifier) = match parts.as_slice() {
        [group, artifact, version] => (*group, *artifact, *version, None),
        [group, artifact, version, classifier] => (*group, *artifact, *version, Some(*classifier)),
        _ => return None,
    };
    let file = match classifier {
        Some(classifier) => format!("{artifact}-{version}-{classifier}.{extension}"),
        None => format!("{artifact}-{version}.{extension}"),
    };
    Some(format!("{}/{artifact}/{version}/{file}", group.replace('.', "/")))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rules(json: &str) -> Vec<Rule> {
        serde_json::from_str(json).unwrap()
    }

    #[test]
    fn builds_maven_paths() {
        assert_eq!(
            maven_path("net.fabricmc:fabric-loader:0.19.5").as_deref(),
            Some("net/fabricmc/fabric-loader/0.19.5/fabric-loader-0.19.5.jar")
        );
        assert_eq!(
            maven_path("org.lwjgl:lwjgl:3.4.1:natives-windows").as_deref(),
            Some("org/lwjgl/lwjgl/3.4.1/lwjgl-3.4.1-natives-windows.jar")
        );
        assert_eq!(maven_path("broken"), None);
    }

    #[test]
    fn last_matching_rule_wins() {
        let other_os = if OS_NAME == "windows" { "linux" } else { "windows" };
        let only_here = rules(&format!(r#"[{{"action":"allow","os":{{"name":"{OS_NAME}"}}}}]"#));
        let only_elsewhere = rules(&format!(r#"[{{"action":"allow","os":{{"name":"{other_os}"}}}}]"#));
        let everywhere_but_here = rules(&format!(
            r#"[{{"action":"allow"}},{{"action":"disallow","os":{{"name":"{OS_NAME}"}}}}]"#
        ));
        assert!(allowed(&[], &[]));
        assert!(allowed(&only_here, &[]));
        assert!(!allowed(&only_elsewhere, &[]));
        assert!(!allowed(&everywhere_but_here, &[]));
    }

    #[test]
    fn features_select_arguments() {
        let arguments: Vec<Argument> = serde_json::from_str(
            r#"["--username", "${auth_player_name}",
                {"rules":[{"action":"allow","features":{"is_demo_user":true}}],"value":"--demo"},
                {"rules":[{"action":"allow","features":{"is_quick_play_multiplayer":true}}],
                 "value":["--quickPlayMultiplayer","${quickPlayMultiplayer}"]}]"#,
        )
        .unwrap();
        assert_eq!(
            expand(&arguments, &["is_quick_play_multiplayer"]),
            ["--username", "${auth_player_name}", "--quickPlayMultiplayer", "${quickPlayMultiplayer}"]
        );
    }

    #[test]
    fn child_libraries_replace_parent_versions() {
        let parent: Vec<Library> = serde_json::from_str(
            r#"[{"name":"org.ow2.asm:asm:9.0","url":"https://a/"},
                {"name":"org.lwjgl:lwjgl:3.4.1:natives-windows","url":"https://a/"},
                {"name":"org.lwjgl:lwjgl:3.4.1","url":"https://a/"}]"#,
        )
        .unwrap();
        let child: Vec<Library> =
            serde_json::from_str(r#"[{"name":"org.ow2.asm:asm:9.10.1","url":"https://maven.fabricmc.net/"}]"#).unwrap();
        let names: Vec<&str> = merge_libraries(&child, &parent).iter().map(|l| l.name.as_str()).collect();
        assert_eq!(names, ["org.ow2.asm:asm:9.10.1", "org.lwjgl:lwjgl:3.4.1:natives-windows", "org.lwjgl:lwjgl:3.4.1"]);
    }

    #[test]
    fn resolves_fabric_style_library() {
        let library: Library = serde_json::from_str(
            r#"{"name":"net.fabricmc:fabric-loader:0.19.5","url":"https://maven.fabricmc.net/"}"#,
        )
        .unwrap();
        assert_eq!(
            library.resolve().unwrap().url,
            "https://maven.fabricmc.net/net/fabricmc/fabric-loader/0.19.5/fabric-loader-0.19.5.jar"
        );
    }
}
