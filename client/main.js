(w => {
  // // const DP
  // const DBOpenRequest = window.indexedDB.open("toDoList", 4);
  // DBOpenRequest.onerror = function(event) {
  //   note.innerHTML += '<li>Error loading database.</li>';
  // };

  // DBOpenRequest.onsuccess = function(event) {
  //   note.innerHTML += '<li>Database initialised.</li>';

  //   db = DBOpenRequest.result;

  //   // Run the displayData() function to populate the task list with all the to-do list data already in the IDB
  //   displayData();
  // };

  // DBOpenRequest.onupgradeneeded = function(event) {
  //   var db = event.target.result;

  //   db.onerror = function(event) {
  //     note.innerHTML += '<li>Error loading database.</li>';
  //   };

  //   // Create an objectStore for this database

  //   var objectStore = db.createObjectStore("toDoList", { keyPath: "taskTitle" });

  //   // define what data items the objectStore will contain

  //   objectStore.createIndex("hours", "hours", { unique: false });
  //   objectStore.createIndex("minutes", "minutes", { unique: false });
  //   objectStore.createIndex("day", "day", { unique: false });
  //   objectStore.createIndex("month", "month", { unique: false });
  //   objectStore.createIndex("year", "year", { unique: false });

  //   objectStore.createIndex("notified", "notified", { unique: false });

  //   note.innerHTML += '<li>Object store created.</li>';
  // };

  class App {
    constructor(apiService) {
      this._apiService = apiService;
    }

    temperatureCtrl() {
      console.log("temperatureCtrl");
    }

    precipitationCtrl() {
      console.log("precipitationCtrl");
    }
  }

  class ApiService {
    constructor() {}

    async fetchData(url) {
      try {
        const response = await fetch(url);
        return await response.json();
      } catch (err) {
        console.error(err);
      }
    }
  }

  const app = new App(new ApiService());

  w.addEventListener("routeChanged", async event => {
    if (!event.detail.state || typeof app[event.detail.state.controller] !== "function") {
      console.error("Router error: can't load controller")
      return;
    }
    app[event.detail.state.controller]();
  });
})(window);
