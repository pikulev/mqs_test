export default class ApiService {
  constructor(apiUrl) {
    this._apiUrl = apiUrl;
  }

  async fetch(url) {
    try {
      const response = await fetch(`${this._apiUrl}/${url}`);
      return await response.json();
    } catch (err) {
      console.error(err);
    }
  }
}
