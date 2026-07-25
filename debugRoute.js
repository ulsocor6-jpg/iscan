export default async function debugRoute(req, res) {
  const brainBus = (await import("./src/brainbus/brainBus.js")).default;
  res.json(brainBus.dump());
}
