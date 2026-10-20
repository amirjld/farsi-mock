/** Sort so that static segments win over params at the first difference ("/products/new" before "/products/{id}"). */
export function comparePaths(a: string, b: string): number {
  const x = a.split("/"), y = b.split("/");
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const px = /^[{:]/.test(x[i]), py = /^[{:]/.test(y[i]);
    if (px !== py) return px ? 1 : -1;
  }
  return y.length - x.length;
}
