/**
 * The "About" dialog of GOCARMO Ride: the fork's name, who maintains it, what
 * it is based on and where the source code is (the AGPL asks for all of it).
 * One dialog for the start screen and the ride menu: any element marked
 * `data-about-open` opens it. The ride screen is rebuilt for every ride, so
 * the clicks are caught on the document, not on the buttons.
 */
export function initAbout(doc = document) {
  const dialog = doc.getElementById("about");
  if (!dialog) return;
  doc.addEventListener("click", (event) => {
    if (event.target.closest?.("[data-about-open]") && !dialog.open) dialog.showModal();
  });
  doc.getElementById("about-close")?.addEventListener("click", () => dialog.close());
  // A click on the dimmed page around the card closes it.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  // Keys typed here are not ride controls (M, V, the arrows).
  dialog.addEventListener("keydown", (event) => event.stopPropagation());
}
