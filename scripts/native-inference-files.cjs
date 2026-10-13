/** Append exclusions to the existing root matcher, never a separate negative-only FileSet. */
exports.configureNativeInferenceFiles = (fileSets, platform, architecture) => {
  if (!Array.isArray(fileSets)) throw new Error('Expected explicit package file filters.');
  const filters =
    typeof fileSets[0] === 'string'
      ? fileSets
      : fileSets.find((set) => Array.isArray(set.filter) && set.filter.includes('package.json'))
          ?.filter;
  if (!filters) throw new Error('Could not find the application package file filter.');
  for (const target of ['linux', 'darwin', 'win32']) {
    if (target !== platform)
      filters.push(`!node_modules/onnxruntime-node/bin/napi-v3/${target}/**/*`);
    else
      for (const arch of ['x64', 'arm64'])
        if (arch !== architecture)
          filters.push(`!node_modules/onnxruntime-node/bin/napi-v3/${target}/${arch}/**/*`);
  }
};
