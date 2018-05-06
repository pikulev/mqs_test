(w => {
  const LINK_DATA_ATTRUBUTE = "link";
  const ACTIVE_LINK_CLASSNAME = "active";

  const DEFAULT_ROUTE = "/temperature";
  const ROUTES = {
    "/temperature": {
      title: "Temperature (MetaQuotes Software test)",
      state: {
        api: "/api/temperature"
      }
    },
    "/precipitation": {
      title: "Precipitation (MetaQuotes Software test)",
      state: {
        api: "/api/precipitation"
      }
    }
  };

  let currentRoute = w.location.href.split(w.location.host).pop();
  let registeredLinks = [];

  function getRegisteredLinks(attr) {
    const linksElements = w.document.querySelectorAll(`[data-${attr}]`);
    linksElements.forEach(el => {
      el.addEventListener("click", event => {
        event.preventDefault();
        try {
          goToRoute(el.dataset[attr]);
        } catch (err) {
          console.error(err);
        }
      });
    });

    return linksElements;
  }

  function setActiveLink(
    linksElements,
    currentRoute,
    className = ACTIVE_LINK_CLASSNAME
  ) {
    linksElements.forEach(el => {
      const linkToCurrentRoute =
        el.dataset[LINK_DATA_ATTRUBUTE] === currentRoute;
      el.classList[linkToCurrentRoute ? "add" : "remove"](className);
    });
  }

  function goToRoute(route, replace = false) {
    if ((route in ROUTES) === false) {
      throw new Error(`Unknown route: ${route}`);
    }
    if (currentRoute === route) {
      return;
    }
    w.history[replace ? "replaceState" : "pushState"](
      ROUTES[route].state,
      ROUTES[route].title,
      route
    );

    const routeChangedEvent = new CustomEvent("routeChanged", {
      detail: ROUTES[route]
    });
    w.dispatchEvent(routeChangedEvent);

    currentRoute = route;
    setActiveLink(registeredLinks, currentRoute);
  }

  w.addEventListener("load", () => {
    registeredLinks = getRegisteredLinks(LINK_DATA_ATTRUBUTE);
    goToRoute(currentRoute in ROUTES? currentRoute : DEFAULT_ROUTE, true);
  });
})(window);
