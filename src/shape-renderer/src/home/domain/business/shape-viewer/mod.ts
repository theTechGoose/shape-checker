export default class ShapeViewer {
  tree = "Loading..."

  async onMount() {
    const resp = await fetch("/canonical-paths.json")
    const data = await resp.json()
    this.tree = JSON.stringify(data, null, 2)
  }
}
