(w => {
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
        // todo: why await?
        return await response.json();
      } catch (err) {
        console.error(err);
      }
    }
  }

  class DbService {
    constructor(indexedDB, version) {
      this.indexedDB = indexedDB;
      this.version = version;
    }

    init() {
      return new Promise(resolve => {
        const DBOpenRequest = this.indexedDB.open("MQS_test_DB", this.version);
        DBOpenRequest.onerror = event => {
          throw new Error("Error loading database (opening)");
        };
        DBOpenRequest.onsuccess = event => {
          this._db = DBOpenRequest.result;
          resolve(this);
          console.info("Database initialised");
        };

        DBOpenRequest.onupgradeneeded = event => {
          const db = event.target.result;

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
        };
      });
    }
  }

  const db = new DbService(w.indexedDB, 2);
  console.log(db)
db.init().then(() => {console.log("URSSS")})
  const app = new App(new ApiService());

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
