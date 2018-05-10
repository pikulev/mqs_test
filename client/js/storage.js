/*
  * StorageService
  * 
  * */
export default class StorageService {
  constructor({ dbName, version }, indexedDB, IDBKeyRange, ApiService, TransformService, UtilsService) {
    this.version = version;
    this.dbName = dbName;
    this._indexedDB = indexedDB;
    this._IDBKeyRange = IDBKeyRange;
    this._ApiService = ApiService;
    this._TransformService = TransformService;
    this._UtilsService = UtilsService;
  }

  /*
  * Открывает БД, апгрейдит если надо, и если всё хорошо то отдаёт готовы сервис  
  * PS: хорошо бы какую то отдельную сущность для конфигурации сделать
  * public
  * */
  init() {
    const DBOpenRequest = this._indexedDB.open(this.dbName, this.version);

    return new Promise(resolve => {
      DBOpenRequest.onerror = event => {
        throw new Error("Error loading database (opening)");
      };

      DBOpenRequest.onsuccess = event => {
        this._db = DBOpenRequest.result;
        this._transactoinsFactory = this._getTransactionsFactory(this._db);
        this._db.onclose = () => this.init();

        // отдаём сервис, он готов
        resolve(this);
      };

      DBOpenRequest.onupgradeneeded = event => {
        this._onupgradeneeded(event.target.result);
      };
    });
  }

  /*
  * Берет название таблицы, range ключей, yScaleFactor - на сколько ратянуть по Y и averageToLimit - до какого объема ужать
  * public
  * */
  async getItemsIterator(objStoreName, lowerKey, upperKey, yScaleFactor, averageToLimit) {
    // берем из базы все записи (месяцы)
    const tableEntries = await this._getTableEntries(objStoreName, lowerKey, upperKey);

    // делаем преаллокацию и препопуляцию массива нужной длины
    const transformPomises = this._UtilsService.getObjArray(tableEntries.length);
    const chunkSize = averageToLimit ? Math.ceil(tableEntries.length * 31 / averageToLimit) : 1;

    console.log(chunkSize, averageToLimit, tableEntries.length);

    for (let i = 0; i < tableEntries.length; i++) {
      // ждем обещания от трансформатора
      transformPomises[i] = await this._TransformService.dbToCanvasFormat(tableEntries[i].value, yScaleFactor, chunkSize);
    }

    const iterator = function*() {
      for (let i = 0; i < tableEntries.length; i++) {
        for (let promise of transformPomises[i]()) {
          yield promise;
        }
      }
    };

    // отдаем итератор (уже по каждой записи, не по месяцам)
    return iterator;
  }

  /*
  * Синкает таблицу с API
  * public
  * */
  async sync(objStoreName, apiPath) {
    //todo: может опустошать таблицу сначала
    const serverData = await this._ApiService.fetch(apiPath);
    const tableObjectIt = await this._TransformService.serverToDBFormat(serverData, 1);

    // результат трансформации не массив а один обхект, поэтому просто берем результат, без итераций
    const tableObject = tableObjectIt().next().value;
    const keys = Object.keys(tableObject);
    let transaction = null;

    for (let lastIndex = keys.length - 1, i = 0; i < keys.length; i++) {
      const key = keys[i];

      if (i === lastIndex) {
        transaction.onsuccess = Promise.resolve;
      }

      transaction = this._transactoinsFactory[objStoreName]();
      transaction.add(tableObject[key], key);
    }

    // возвращаем промис последнего onsuccess - считаем, что всё завершилось удачно
    return transaction.onsuccess;
  }

  /*
  * Реализует критери синкать или нет. Пока смотрит просто на наличие записей в таблице
  * public
  * */
  async isSyncNeeded(objStoreName) {
    const count = await this.count(objStoreName);
    return count === 0;
  }

  /*
  * Отдает кол-во записей в таблице, по указанному query
  * public
  * */
  count(objStoreName, query) {
    const transaction = this._transactoinsFactory[objStoreName]();
    const countRequest = transaction.count(query);
    return new Promise(resolve => {
      countRequest.onsuccess = () => {
        resolve(countRequest.result);
      };
    });
  }

  /*
  * Отдает промис на все записи из таблицы, умеет брать range по lowerKey, upperKey. 
  * private
  * */
  async _getTableEntries(objStoreName, lowerKey, upperKey) {
    const boundKeyRange = lowerKey && upperKey ? this._IDBKeyRange.bound(lowerKey, upperKey, false, false) : null;

    const count = await this.count(objStoreName, boundKeyRange);
    const result = this._UtilsService.getObjArray(count);

    const cursorHandlerFactory = (resolve, index) => event => {
      const cursor = event.target.result;
      if (!cursor) {
        resolve(result);
        return;
      }
      result[index++] = { key: cursor.key, value: cursor.value };
      cursor.continue();
    };

    return new Promise(resolve => {
      let index = 0;
      const transaction = this._transactoinsFactory[objStoreName]();
      transaction.openCursor(boundKeyRange).onsuccess = cursorHandlerFactory(resolve, index);
    });
  }

  /*
  * Фабрика трансакций, отдает объект с транзакцией для каждой таблицы 
  * private
  * */
  _getTransactionsFactory(db) {
    return Object.create(
      {},
      {
        ["temperature"]: {
          get: () => () => db.transaction(["temperature"], "readwrite").objectStore("temperature")
        },
        ["precipitation"]: {
          get: () => () => db.transaction(["precipitation"], "readwrite").objectStore("precipitation")
        }
      }
    );
  }

  _onupgradeneeded(db) {
    db.onerror = function(event) {
      throw new Error("Error loading database (upgrading)");
    };

    const tempObjStore = db.createObjectStore("temperature");
    const precObjStore = db.createObjectStore("precipitation");
  }
}
