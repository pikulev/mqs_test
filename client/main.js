(w => {
  const API_URL = "/api";

  class App {
    constructor(apiService, dbService) {
      this._apiService = apiService;
      this._dbServicePromise = dbService.init();
    }

    temperatureCtrl() {
      console.log("temperatureCtrl");
    }

    precipitationCtrl() {
      console.log("precipitationCtrl");
    }
  }

  class ApiService {
    constructor(apiUrl) {
      this._apiUrl = apiUrl;
    }

    async fetch(url) {
      try {
        const response = await fetch(`${this._apiUrl}/${url}`);
        // todo: why await?
        return await response.json();
      } catch (err) {
        console.error(err);
      }
    }
  }

  class DbService {
    constructor(indexedDB, version) {
      this.version = version;
      this._indexedDB = indexedDB;
    }

    init() {
      return new Promise(resolve => {
        const DBOpenRequest = this._indexedDB.open("MQS_test_DB", this.version);
        DBOpenRequest.onerror = event => {
          throw new Error("Error loading database (opening)");
        };
        DBOpenRequest.onsuccess = event => {
          this._db = DBOpenRequest.result;
          resolve(this);
        };
        DBOpenRequest.onupgradeneeded = event =>
          this._onupgradeneeded(event.target.result);
      });
    }

    _onupgradeneeded(db) {
      db.onerror = function(event) {
        throw new Error("Error loading database (upgrading)");
      };

      this._temperatureObjStore = db.createObjectStore("temperature", {
        keyPath: "t"
      });
      this._precipitationObjStore = db.createObjectStore("precipitation", {
        keyPath: "t"
      });
      this._temperatureObjStore.createIndex("v", "v", { unique: false });
      this._precipitationObjStore.createIndex("v", "v", { unique: false });
    }
  }

  const dbService = new DbService(w.indexedDB, 2);
  const apiService = new ApiService(API_URL);
  const app = new App(apiService, dbService);

  w.addEventListener("routeChanged", async event => {
    if (!event.detail.state) {
      console.error("Router error: can't find state object");
      return;
    }
    if (typeof app[event.detail.state.controller] !== "function") {
      console.error("Router error: can't find controller");
      return;
    }
    app[event.detail.state.controller]();
  });
})(window);
