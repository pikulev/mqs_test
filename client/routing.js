(w => {
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
  const LINK_DATA_ATTRUBUTE = "link"
  const ACTIVE_LINK_CLASSNAME = "active";

  let currentRoute = w.location.href.split(w.location.host).pop();
  let registeredLinks = [];

  function getRegisteredLinks(attr) {
    const linksElements = w.document.querySelectorAll(`[data-${attr}]`);
    linksElements.forEach((el) => {
      el.addEventListener("click", () => {
        try {
          goToRoute(el.dataset[attr]);
        } catch (err) {
          console.error(err);
        }
      });
    });

    return linksElements;
  }

  function setActiveLink(linksElements, currentRoute, className = ACTIVE_LINK_CLASSNAME) {
    linksElements.forEach((el) => {
        const linkToCurrentRoute = el.dataset[LINK_DATA_ATTRUBUTE] === currentRoute
        el.classList[linkToCurrentRoute ? "add" : "remove"](className)
    });
  }

  function goToRoute(route, replace = false) {
    if (isKnownRoute(route) === false) {
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
    setActiveLink(registeredLinks, currentRoute)
  }

  function isKnownRoute(route) {
    return Object.prototype.hasOwnProperty.call(ROUTES, route);
  }

  w.addEventListener("load", () => {
    registeredLinks = getRegisteredLinks(LINK_DATA_ATTRUBUTE);
    goToRoute(isKnownRoute(currentRoute) ? currentRoute : DEFAULT_ROUTE, true);
  });
})(window);