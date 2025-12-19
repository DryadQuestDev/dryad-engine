/**
 * Validates if a version string follows semantic versioning format (a.b.c)
 * @param version - Version string to validate
 * @returns Object with isValid boolean and optional error message
 */
export function validateVersionFormat(version: string | undefined): { isValid: boolean; error?: string } {
  if (!version) {
    return { isValid: false, error: 'Version is required. Update it in General->Manifest->version' };
  }

  if (typeof version !== 'string') {
    return { isValid: false, error: 'Version must be a string. Update it in General->Manifest->version' };
  }

  const trimmedVersion = version.trim();

  if (trimmedVersion === '') {
    return { isValid: false, error: 'Version cannot be empty. Update it in General->Manifest->version' };
  }

  // Check format: must be a.b.c where a, b, c are non-negative integers
  const versionRegex = /^\d+\.\d+\.\d+$/;
  if (!versionRegex.test(trimmedVersion)) {
    return { isValid: false, error: 'Version number should be in the format of a.b.c (e.g 0.3.42). Update it in General->Manifest->version' };
  }

  // Validate that parts are valid integers
  const parts = trimmedVersion.split('.');
  for (let i = 0; i < parts.length; i++) {
    const num = parseInt(parts[i], 10);
    if (isNaN(num) || num < 0) {
      return { isValid: false, error: 'Version numbers must be non-negative integers. Update it in General->Manifest->version' };
    }
  }

  return { isValid: true };
}

/**
 * Compares two semantic version strings (format: "a.b.c")
 * @param current - Current version string (e.g., "1.2.3")
 * @param required - Required minimum version string (e.g., "1.0.0")
 * @param satisfyEqual - If true (default), current === required satisfies. If false, current must exceed required.
 * @returns true if current version meets or exceeds required version (or exceeds if satisfyEqual=false), false otherwise
 */
export function satisfiesMinVersion(current: string, required: string | undefined, satisfyEqual: boolean = true): boolean {
  // If no required version is specified, always satisfied
  if (!required) {
    return true;
  }

  // If current version is not specified, fail
  if (!current) {
    return false;
  }

  try {
    const currentParts = current.split('.').map(num => parseInt(num, 10));
    const requiredParts = required.split('.').map(num => parseInt(num, 10));

    // Ensure we have at least 3 parts for both versions (major, minor, patch)
    while (currentParts.length < 3) currentParts.push(0);
    while (requiredParts.length < 3) requiredParts.push(0);

    // Compare major version
    if (currentParts[0] > requiredParts[0]) return true;
    if (currentParts[0] < requiredParts[0]) return false;

    // Major versions are equal, compare minor version
    if (currentParts[1] > requiredParts[1]) return true;
    if (currentParts[1] < requiredParts[1]) return false;

    // Major and minor versions are equal, compare patch version
    if (satisfyEqual) {
      // Default behavior: current >= required
      if (currentParts[2] >= requiredParts[2]) return true;
    } else {
      // Strict mode: current must exceed required (current > required)
      if (currentParts[2] > requiredParts[2]) return true;
    }
    return false;

  } catch (error) {
    console.error('Error comparing versions:', error);
    // If version parsing fails, assume incompatible
    return false;
  }
}

/**
 * Checks if a manifest's minimum engine version requirement is satisfied
 * @param engineVersion - Current engine version
 * @param manifestMinVersion - Required minimum version from manifest
 * @param getString - Optional function to get localized strings
 * @returns Object with isCompatible boolean and optional warning message
 */
export function checkManifestCompatibility(
  engineVersion: string,
  manifestMinVersion: string | undefined,
  getString?: (key: string, params?: Record<string, string>) => string
): { isCompatible: boolean; warningMessage?: string } {
  const isCompatible = satisfiesMinVersion(engineVersion, manifestMinVersion);

  if (!isCompatible && manifestMinVersion) {
    let warningMessage: string;

    if (getString) {
      warningMessage = getString('version_incompatible', {
        required: manifestMinVersion,
        current: engineVersion
      });
    } else {
      // Fallback if getString is not provided
      warningMessage = `This requires engine version ${manifestMinVersion} or higher. Your current version is ${engineVersion}. Please download the latest version to play.`;
    }

    return {
      isCompatible: false,
      warningMessage
    };
  }

  return { isCompatible: true };
}
