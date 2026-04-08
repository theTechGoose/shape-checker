export default class TreeNode {
  expanded = true;
  name = "";
  node = {};
  depth = 0;

  toggle() {
    this.expanded = !this.expanded;
  }
}
