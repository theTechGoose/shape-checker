export default class IndexPage {
  tree = "";
  error = "";

  async onMount() {
    try {
      const resp = await fetch("/api/shape");
      this.tree = JSON.stringify(await resp.json(), null, 2);
    } catch (err) {
      this.error = String(err);
    }
  }
}
