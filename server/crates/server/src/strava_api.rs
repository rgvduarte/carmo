//! The HTTP calls to Strava: token exchange and refresh, uploads, marking
//! activities as virtual rides.

use crate::strava::{StravaConfig, TokenResponse, UploadStatus};

/// A call to Strava that did not work: what happened (never a token), and the
/// HTTP status if Strava answered at all.
#[derive(Debug)]
pub struct StravaError {
    pub message: String,
    pub status: Option<u16>,
}

impl StravaError {
    fn http(what: &str, status: reqwest::StatusCode) -> Self {
        Self {
            message: format!("{what} failed with HTTP {status}"),
            status: Some(status.as_u16()),
        }
    }

    /// Strava does not accept the access token (any more): the rider withdrew
    /// this server's access, or the token is stale. Trying again cannot help;
    /// connecting again does.
    pub fn unauthorized(&self) -> bool {
        self.status == Some(401)
    }

    /// The same for a token refresh, where Strava answers a refresh token it
    /// no longer knows with 400.
    pub fn refresh_rejected(&self) -> bool {
        matches!(self.status, Some(400 | 401))
    }
}

impl std::fmt::Display for StravaError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for StravaError {}

impl From<reqwest::Error> for StravaError {
    fn from(error: reqwest::Error) -> Self {
        Self {
            message: error.to_string(),
            status: None,
        }
    }
}

async fn token_request(
    http: &reqwest::Client,
    config: &StravaConfig,
    form: &[(&str, &str)],
) -> Result<TokenResponse, StravaError> {
    let response = http
        .post(format!("{}/oauth/token", config.api_url))
        .form(form)
        .send()
        .await?;
    if !response.status().is_success() {
        return Err(StravaError::http("token request", response.status()));
    }
    Ok(response.json().await?)
}

/// Trades the code from the OAuth callback for tokens and the athlete.
pub async fn exchange_code(
    http: &reqwest::Client,
    config: &StravaConfig,
    code: &str,
) -> Result<TokenResponse, StravaError> {
    token_request(
        http,
        config,
        &[
            ("client_id", config.client_id.as_str()),
            ("client_secret", config.client_secret.as_str()),
            ("code", code),
            ("grant_type", "authorization_code"),
        ],
    )
    .await
}

pub async fn refresh(
    http: &reqwest::Client,
    config: &StravaConfig,
    refresh_token: &str,
) -> Result<TokenResponse, StravaError> {
    token_request(
        http,
        config,
        &[
            ("client_id", config.client_id.as_str()),
            ("client_secret", config.client_secret.as_str()),
            ("refresh_token", refresh_token),
            ("grant_type", "refresh_token"),
        ],
    )
    .await
}

/// A ride file the client sends for upload.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RideFile {
    /// A FIT activity: the client marks it a virtual ride (`sub_sport`), so
    /// Strava files it as one and keeps its elevation.
    Fit(Vec<u8>),
    /// TCX, from older clients: Strava makes it a plain ride and replaces its
    /// elevation from its map.
    Tcx(String),
}

impl RideFile {
    /// Recognises a FIT file by its header or a TCX file by its root element.
    pub fn detect(body: &[u8]) -> Option<Self> {
        if body.len() > 14 && &body[8..12] == b".FIT" {
            return Some(RideFile::Fit(body.to_vec()));
        }
        let text = std::str::from_utf8(body).ok()?.trim_start_matches('\u{feff}');
        (text.trim_start().starts_with("<?xml") && text.contains("<TrainingCenterDatabase"))
            .then(|| RideFile::Tcx(text.to_owned()))
    }
}

/// The activity description. Strava descriptions are plain text, but it turns
/// full URLs into links, so the server links to itself. Just the fork's name
/// and the address: it reads the same in every rider's language.
pub fn description(public_url: &str) -> String {
    format!("{}: {public_url}", crate::APP_NAME)
}

/// The activity's name when the client sent none (it sends the route's name).
pub const DEFAULT_ACTIVITY_NAME: &str = crate::APP_NAME;

/// The start of the `external_id` Strava keeps with an upload.
pub const EXTERNAL_ID_PREFIX: &str = "gocarmo-ride";

/// Uploads a ride file. A TCX ride is turned into a virtual ride by
/// [`mark_virtual_ride`] once it is processed (where Strava allows it).
pub async fn upload(
    http: &reqwest::Client,
    config: &StravaConfig,
    access_token: &str,
    ride: RideFile,
    name: &str,
    description: &str,
    external_id: &str,
) -> Result<UploadStatus, StravaError> {
    let (file, data_type) = match ride {
        RideFile::Fit(bytes) => (
            reqwest::multipart::Part::bytes(bytes)
                .file_name("gocarmo-ride.fit")
                .mime_str("application/vnd.ant.fit")?,
            "fit",
        ),
        RideFile::Tcx(text) => (
            reqwest::multipart::Part::text(text)
                .file_name("gocarmo-ride.tcx")
                .mime_str("application/vnd.garmin.tcx+xml")?,
            "tcx",
        ),
    };
    let form = reqwest::multipart::Form::new()
        .part("file", file)
        .text("data_type", data_type)
        .text("name", name.to_owned())
        .text("description", description.to_owned())
        .text("external_id", external_id.to_owned());
    let response = http
        .post(format!("{}/api/v3/uploads", config.api_url))
        .bearer_auth(access_token)
        .multipart(form)
        .send()
        .await?;
    if !response.status().is_success() {
        return Err(StravaError::http("upload", response.status()));
    }
    Ok(response.json().await?)
}

/// Sets the sport type to `VirtualRide`: Strava keeps those off real-world
/// segments and outdoor stats but still shows the map. (The upload API has no
/// field for the sport type, and TCX only knows "Biking".)
pub async fn mark_virtual_ride(
    http: &reqwest::Client,
    config: &StravaConfig,
    access_token: &str,
    activity_id: u64,
) -> Result<(), StravaError> {
    let response = http
        .put(format!("{}/api/v3/activities/{activity_id}", config.api_url))
        .bearer_auth(access_token)
        .json(&serde_json::json!({ "sport_type": "VirtualRide" }))
        .send()
        .await?;
    if !response.status().is_success() {
        return Err(StravaError::http("updating the activity", response.status()));
    }
    Ok(())
}

/// Asks Strava whether an upload became an activity yet.
pub async fn upload_status(
    http: &reqwest::Client,
    config: &StravaConfig,
    access_token: &str,
    upload_id: u64,
) -> Result<UploadStatus, StravaError> {
    let response = http
        .get(format!("{}/api/v3/uploads/{upload_id}", config.api_url))
        .bearer_auth(access_token)
        .send()
        .await?;
    if !response.status().is_success() {
        return Err(StravaError::http("upload status", response.status()));
    }
    Ok(response.json().await?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn description_names_the_fork_and_links_to_the_server() {
        assert_eq!(
            description("https://ride.example.com"),
            "GOCARMO Ride: https://ride.example.com"
        );
        assert_eq!(DEFAULT_ACTIVITY_NAME, "GOCARMO Ride");
    }

    #[test]
    fn only_strava_saying_no_to_the_tokens_means_connect_again() {
        let answered = |status: u16| StravaError::http("upload", reqwest::StatusCode::from_u16(status).unwrap());
        assert!(answered(401).unauthorized());
        assert!(answered(401).refresh_rejected() && answered(400).refresh_rejected());
        // A bad request on an upload is a bad file, not a withdrawn permission.
        assert!(!answered(400).unauthorized());
        for other in [403, 404, 429, 500, 503] {
            assert!(
                !answered(other).unauthorized() && !answered(other).refresh_rejected(),
                "{other}"
            );
        }
        assert_eq!(
            answered(503).to_string(),
            "upload failed with HTTP 503 Service Unavailable"
        );
    }

    #[test]
    fn ride_files_are_recognised_by_their_content() {
        let mut fit = vec![14, 0x20, 0x54, 0x08, 0, 0, 0, 0];
        fit.extend_from_slice(b".FIT");
        fit.extend_from_slice(&[0, 0, 1, 2]);
        assert_eq!(RideFile::detect(&fit), Some(RideFile::Fit(fit.clone())));
        let tcx = "\u{feff}<?xml version=\"1.0\"?><TrainingCenterDatabase/>";
        assert!(matches!(RideFile::detect(tcx.as_bytes()), Some(RideFile::Tcx(t)) if t.starts_with("<?xml")));
        assert_eq!(RideFile::detect(b"<?xml version=\"1.0\"?><gpx/>"), None);
        assert_eq!(RideFile::detect(&[0xff, 0xfe, 0x00]), None);
    }
}
