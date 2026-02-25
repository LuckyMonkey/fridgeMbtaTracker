const modules = import.meta.glob('./lang/*/index.js', { eager: true });

const translations = Object.entries(modules).reduce((acc, [path, module]) => {
  const match = path.match(/\.\/lang\/([^/]+)\//);
  if (match) {
    acc[match[1]] = module.default;
  }
  return acc;
}, {});

export { translations };
export const AVAILABLE_LANGUAGES = Object.keys(translations);
