/**
 * The "About" dialog of GOCARMO Ride: the fork's name, who maintains it, what
 * it is based on and where the source code is (the AGPL asks for all of it).
 * One dialog for the start screen and the ride menu: any element marked
 * `data-about-open` opens it. The ride screen is rebuilt for every ride, so
 * the clicks are caught on the document, not on the buttons.
 *
 * The "Privacy" dialog works the same way (`data-privacy-open`): what this
 * deployment's server and the browser keep.
 */
import { BUILD } from "../build.js";

const SOURCE_REPO = "https://github.com/rgvduarte/carmo";
const SOURCE_BRANCH = "gocarmo-ride";

/**
 * Where the source of the running version is: the exact commit when the build
 * knows it (AGPL section 13 offers the source of the version being run), else
 * the fork's branch. The deploy stamps `build.js` with the fork's commit.
 */
export const sourceUrl = (sha = BUILD.sha) => `${SOURCE_REPO}/tree/${/^[0-9a-f]{7,40}$/.test(sha) ? sha : SOURCE_BRANCH}`;

/**
 * One of the page's information dialogs: any element carrying `openAttr`
 * opens it (caught on the document, the ride screen is rebuilt for every
 * ride), its close button and a click on the dimmed page around the card
 * close it.
 */
function initDialog(doc, id, openAttr) {
  const dialog = doc.getElementById(id);
  if (!dialog) return;
  doc.addEventListener("click", (event) => {
    if (event.target.closest?.(`[${openAttr}]`) && !dialog.open) dialog.showModal();
  });
  doc.getElementById(`${id}-close`)?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  // Keys typed here are not ride controls (M, V, the arrows).
  dialog.addEventListener("keydown", (event) => event.stopPropagation());
}

export function initAbout(doc = document) {
  // Every "Source code" link (the start screen's foot, the ride menu, the dialog) points at the running version.
  for (const link of doc.querySelectorAll("[data-source-link]")) link.href = sourceUrl();
  initDialog(doc, "about", "data-about-open");
  // The privacy text of this deployment: from the start screen's foot and from About (so from the ride menu too).
  initDialog(doc, "privacy", "data-privacy-open");
}
