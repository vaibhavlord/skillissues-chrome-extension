const origin = "https://codeforces.com";

export function identifyProblem(path) {
  if (typeof path !== "string") return null;
  const archive = /^\/problemset\/problem\/(\d+)\/([A-Z][A-Z0-9]*)$/.exec(path);
  const contest = /^(\/(?:(?:group\/[A-Za-z0-9]+\/)?contest|gym)\/\d+)\/problem\/([A-Z][A-Z0-9]*)$/.exec(path);

  if (archive) {
    return { path, url: origin + path, target: archive[1] + archive[2], submitPath: "/problemset/submit" };
  }
  if (contest) {
    return { path, url: origin + path, target: contest[2], submitPath: contest[1] + "/submit" };
  }
  return null;
}

export function problemFromUrl(address) {
  try {
    const url = new URL(address);
    return url.origin === origin ? identifyProblem(url.pathname.replace(/\/$/, "")) : null;
  } catch {
    return null;
  }
}

export function submitUrl(problem) {
  return origin + problem.submitPath;
}

export function problemKey(path) {
  return "problem:" + path;
}
