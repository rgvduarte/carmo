//! The HTTP calls to Strava: token exchange and refresh, revoking access,
//! uploads and their status.

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

/// Withdraws this server's access to the athlete on Strava
/// (`POST /oauth/revoke`, read 12.11.2026): every access and refresh token the
/// application holds for the athlete stops working, and the athlete's place
/// in the application's athlete limit is free again. Strava answers 200
/// whether or not it knew the token.
pub async fn revoke(http: &reqwest::Client, config: &StravaConfig, refresh_token: &str) -> Result<(), StravaError> {
    let response = http
        .post(format!("{}/oauth/revoke", config.api_url))
        .basic_auth(&config.client_id, Some(&config.client_secret))
        .form(&[("token", refresh_token), ("token_type_hint", "refresh_token")])
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await?;
    if !response.status().is_success() {
        return Err(StravaError::http("revoking access", response.status()));
    }
    Ok(())
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

/// Routes made from third parties' data, and the notice their licences ask for
/// on every work produced from that data and shown to the public (OpenStreetMap:
/// ODbL 1.0, section 4.3; the elevation: the Copernicus DEM licence, its
/// wording for adapted data). A fixed list: the client names the route, and
/// only a route listed here adds text to the description. Word for word the
/// same as `ROUTE_DATA_CREDIT` in `client/public/js/view/rideCardModel.js`
/// (a test compares the two).
const ROUTE_DATA_CREDIT: &[(&str, &str)] = &[(
    "lanzarote-lava-180",
    "© OpenStreetMap contributors, ODbL · Elevation produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved",
)];

/// The notice a route's data asks for, or `None` for any other route, an
/// unknown one or none.
pub fn route_data_credit(route_id: Option<&str>) -> Option<&'static str> {
    let route_id = route_id?;
    ROUTE_DATA_CREDIT
        .iter()
        .find(|(known, _)| *known == route_id)
        .map(|(_, credit)| *credit)
}

/// The activity description. Strava descriptions are plain text, but it turns
/// full URLs into links: the fork's name and the page that explains the game
/// (the address the Strava application lists as its website). A ride on a
/// route made from others' data adds that data's notice after a blank line.
/// It reads the same in every rider's language; the finish dialog tells the
/// rider before sending. Nothing the client sends is copied into it.
pub fn description(route_id: Option<&str>) -> String {
    let base = format!("{}: {}", crate::APP_NAME, crate::APP_URL);
    match route_data_credit(route_id) {
        Some(credit) => format!("{base}\n\n{credit}"),
        None => base,
    }
}

/// The activity's name when the client sent none (it sends the route's name).
pub const DEFAULT_ACTIVITY_NAME: &str = crate::APP_NAME;

/// The start of the `external_id` Strava keeps with an upload.
pub const EXTERNAL_ID_PREFIX: &str = "gocarmo-ride";

/// What kind of ride an upload is: on a route (filed as a virtual ride, which
/// Strava keeps off real-world segments but draws on its map), or a class in
/// the studio (left as the file says: an indoor ride without a map).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RideKind {
    Route,
    Class,
}

/// Uploads a ride file. A ride on a route goes up as a `VirtualRide`: the
/// upload's `sport_type` overrides what Strava detects in the file, so no
/// second call is needed once the activity exists.
#[allow(clippy::too_many_arguments)]
pub async fn upload(
    http: &reqwest::Client,
    config: &StravaConfig,
    access_token: &str,
    ride: RideFile,
    kind: RideKind,
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
    let form = match kind {
        RideKind::Route => form.text("sport_type", "VirtualRide"),
        RideKind::Class => form,
    };
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
    fn description_names_the_fork_and_links_to_its_page() {
        assert_eq!(description(None), "GOCARMO Ride: https://gocarmo.com/ride/");
        assert_eq!(DEFAULT_ACTIVITY_NAME, "GOCARMO Ride");
    }

    #[test]
    fn a_ride_on_a_route_made_from_others_data_carries_their_notice() {
        assert_eq!(
            description(Some("lanzarote-lava-180")),
            "GOCARMO Ride: https://gocarmo.com/ride/\n\n© OpenStreetMap contributors, ODbL · Elevation produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved"
        );
        // Any other route, an unknown one or none: the description as before,
        // and never the client's own words.
        for other in [
            None,
            Some(""),
            Some("rolling-hills"),
            Some("Lanzarote-Lava-180"),
            Some("lanzarote-lava-180 "),
            Some("<b>made up</b>"),
        ] {
            assert_eq!(
                description(other),
                "GOCARMO Ride: https://gocarmo.com/ride/",
                "{other:?}"
            );
        }
        assert_eq!(route_data_credit(Some("rolling-hills")), None);
    }

    /// The client's `ROUTE_DATA_CREDIT`, as `"route": "notice",` lines.
    fn client_route_data_credit() -> Vec<(String, String)> {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../client/public/js/view/rideCardModel.js"
        );
        let code = std::fs::read_to_string(path).unwrap();
        let block = code
            .split_once("export const ROUTE_DATA_CREDIT = Object.freeze({")
            .unwrap()
            .1
            .split_once("});")
            .unwrap()
            .0;
        block
            .lines()
            .filter_map(|line| {
                let (id, rest) = line.trim().strip_prefix('"')?.split_once("\": \"")?;
                let (credit, _) = rest.split_once("\",")?;
                Some((id.to_owned(), credit.to_owned()))
            })
            .collect()
    }

    #[test]
    fn the_notices_are_word_for_word_the_clients() {
        let client = client_route_data_credit();
        assert!(!client.is_empty());
        let server: Vec<(String, String)> = ROUTE_DATA_CREDIT
            .iter()
            .map(|(id, credit)| ((*id).to_owned(), (*credit).to_owned()))
            .collect();
        assert_eq!(server, client);
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
