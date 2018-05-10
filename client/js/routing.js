/*
  * Исполняет начальную настройку роутера и декларирует роуты
  * 
  * */

(w => {
  // ссылки роутера имеют аттрибут data-link
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

  /*
  * Фабрика обработчиков ссылок - конфигурируется роутом
  * 
  * */
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

  /*
  * Отдаст все линки, которые будет использовать роутер
  * (с аттрибутами data-link)
  * 
  * */
  function getRegisteredLinks(attr, clickHandler) {
    const linksElements = w.document.querySelectorAll(`[data-${attr}]`);
    linksElements.forEach(el => {
      el.addEventListener("click", getLinkClickHandler(el.dataset[attr]));
    });
    return linksElements;
  }

  /*
  * Устанавливает линк как активный, если находимся на нужном роуте
  * 
  * */
  function setActiveLink(linksElements, currentRoute, className = ACTIVE_LINK_CLASSNAME) {
    linksElements.forEach(el => {
      const linkToCurrentRoute = el.dataset[LINK_DATA_ATTRUBUTE] === currentRoute;
      el.classList[linkToCurrentRoute ? "add" : "remove"](className);
    });
  }

  /*
  * Переходит на указанный роут (умеет заменять историю)
  * 
  * */
  function goToRoute(route, replace = false) {
    if (route in ROUTES === false) {
      throw new Error(`Unknown route: ${route}`);
    }

    w.history[replace ? "replaceState" : "pushState"](ROUTES[route].state, ROUTES[route].title, route);

    const routeChangedEvent = new CustomEvent("routeChanged", {
      detail: ROUTES[route]
    });
    w.dispatchEvent(routeChangedEvent);

    currentRoute = route;
    setActiveLink(registeredLinks, currentRoute);
  }

  function reloadCurrentRoute(params) {
    goToRoute(currentRoute, true, params);
  }

  /*
  * Инициализируем роут по готовности документа
  * 
  * */
  w.document.addEventListener("DOMContentLoaded", () => {
    registeredLinks = getRegisteredLinks(LINK_DATA_ATTRUBUTE);
    goToRoute(startRoute in ROUTES ? startRoute : DEFAULT_ROUTE, true);

    // стыдный проброс пметода для использования в контроллере приложения
    w.reloadCurrentRoute = reloadCurrentRoute;
  });
})(window);
