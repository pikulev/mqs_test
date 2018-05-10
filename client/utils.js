export class UtilsService {
  constructor() {}

  getObjArray(count) {
    return Array.apply(null, Array(count)).map(Object.prototype.valueOf, {});
  }

  getDeferredArray(count) {
    return Array.apply(null, Array(count)).map(
      Deferred.prototype.valueOf,
      new Deferred()
    );
  }
}

export class Deferred {
  constructor() {
    this.promise = new Promise(resolve => {
      this.resolve = resolve;
    });
  }
}
