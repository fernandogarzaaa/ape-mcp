// Share-page live updates: reload on new steps, patch status in place.
// No tokens here — the page talks only to its own relative "stream" URL,
// and all status text goes through textContent.
(function () {
  var es;
  try {
    es = new EventSource("stream");
  } catch (e) {
    return;
  }
  var rt = null;
  function reloadSoon() {
    if (rt) return;
    rt = setTimeout(function () {
      location.reload();
    }, 1500);
  }
  es.addEventListener("step", reloadSoon);
  es.addEventListener("run", function (e) {
    try {
      var r = JSON.parse(e.data);
      var el = document.getElementById("run-status");
      if (el && r.status) el.textContent = r.status;
      if (r.status && r.status !== "running") {
        es.close();
        setTimeout(function () {
          location.reload();
        }, 800);
      } else reloadSoon();
    } catch (err) {
      reloadSoon();
    }
  });
})();
