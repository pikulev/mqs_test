(w => {
  const LINK_DATA_ATTRUBUTE = "link";
  const ACTIVE_LINK_CLASSNAME = "active";

  const DEFAULT_ROUTE = "/temperature";
  const ROUTES = {
    "/temperature": {
      title: "Temperature (MetaQuotes Software test)",
      state: {
        controller: "temperatureCtrl"
      }
    },
    "/precipitation": {
      title: "Precipitation (MetaQuotes Software test)",
      state: {
        controller: "precipitationCtrl"
      }
    }
  };

  const startRoute = w.location.href.split(w.location.host).pop();
  let currentRoute = null;
  let registeredLinks = [];

  function getLinkClickHandler(route) {
    return event => {
      event.preventDefault();
      try {
        if (currentRoute === route) {
          return;
        }
        goToRoute(route);
      } catch (err) {
        console.error(err);
      }
    };
  }

  function getRegisteredLinks(attr, clickHandler) {
    const linksElements = w.document.querySelectorAll(`[data-${attr}]`);
    linksElements.forEach(el => {
      el.addEventListener("click", getLinkClickHandler(el.dataset[attr]));
    });
    return linksElements;
  }

  function setActiveLink(linksElements, currentRoute, className = ACTIVE_LINK_CLASSNAME) {
    linksElements.forEach(el => {
      const linkToCurrentRoute = el.dataset[LINK_DATA_ATTRUBUTE] === currentRoute;
      el.classList[linkToCurrentRoute ? "add" : "remove"](className);
    });
  }

  function goToRoute(route, replace = false) {
    if (route in ROUTES === false) {
      throw new Error(`Unknown route: ${route}`);
    }

    w.history[replace ? "replaceState" : "pushState"](ROUTES[route].state, ROUTES[route].title, route);

    const routeChangedEvent = new CustomEvent("routeChanged", {
      detail: ROUTES[route]
    });
    w.dispatchEvent(routeChangedEvent);

    console.log("dispatched", ROUTES[route].title);
    currentRoute = route;
    setActiveLink(registeredLinks, currentRoute);
  }

  function reloadCurrentRoute(params) {
    goToRoute(currentRoute, true, params);
  }

  w.addEventListener("load", () => {
    registeredLinks = getRegisteredLinks(LINK_DATA_ATTRUBUTE);
    goToRoute(startRoute in ROUTES ? startRoute : DEFAULT_ROUTE, true);
    w.reloadCurrentRoute = reloadCurrentRoute;
  });
})(window);
