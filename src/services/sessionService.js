import { createHash } from "crypto";
import { supabaseAdmin } from "../config/supabaseAdminClient.js";
import logger from "../utils/logger.js";

const TABLE_NAME = "auth_sessions";

/**
 * Creates a SHA-256 hash for secure refresh-token storage.
 * @param {string} token - Plaintext refresh token.
 * @returns {string} Hex-encoded token hash.
 */
function hashRefreshToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Creates an authentication session with a hashed refresh token.
 * @param {object} sessionData - Session data.
 * @param {string} sessionData.profile_id - User profile UUID.
 * @param {string} sessionData.refresh_token - Supabase refresh token.
 * @param {string} [sessionData.ip] - Client IP address.
 * @param {string} [sessionData.user_agent] - Client user agent.
 * @param {string} [sessionData.device_type] - Device type, such as "web_admin", "portal", or "tv".
 * @returns {Promise<object>} Created session row.
 */
async function createSession({
  profile_id,
  refresh_token,
  ip,
  user_agent,
  device_type,
}) {
  if (!profile_id || !refresh_token) {
    throw new Error(
      "Profile ID and refresh token are required to create a session."
    );
  }

  const refresh_token_hash = hashRefreshToken(refresh_token);

  const { data, error } = await supabaseAdmin
    .from(TABLE_NAME)
    .insert({
      profile_id,
      refresh_token_hash,
      ip,
      user_agent,
      device_type: device_type || "web",
      last_used_at: new Date(),
    })
    .select()
    .single();

  if (error) {
    logger.error("Error creating auth session in DB:", error);
    throw error;
  }

  return data;
}

/**
 * Finds an active session by plaintext refresh token.
 * @param {string} refreshToken - Plaintext refresh token.
 * @returns {Promise<object|null>} Matching active session, or null when not found.
 */
async function findSessionByRefreshToken(refreshToken) {
  const refreshTokenHash = hashRefreshToken(refreshToken);
  const { data, error } = await supabaseAdmin
    .from(TABLE_NAME)
    .select("*")
    .eq("refresh_token_hash", refreshTokenHash)
    .eq("revoked", false)
    .single();

  if (error && error.code !== "PGRST116") {
    logger.error("Error finding session by refresh token:", error);
    throw error;
  }

  return data;
}

/**
 * Revokes a session by ID.
 * @param {string} sessionId - Session UUID.
 * @returns {Promise<boolean>} True when the session is revoked successfully.
 */
async function revokeSessionById(sessionId) {
  const { error } = await supabaseAdmin
    .from(TABLE_NAME)
    .update({ revoked: true })
    .eq("id", sessionId);

  if (error) {
    logger.error(`Error revoking session ${sessionId}:`, error);
    return false;
  }
  return true;
}

/**
 * Revokes a session by plaintext refresh token.
 * @param {string} refreshToken - Plaintext refresh token.
 * @returns {Promise<boolean>} True when the matching session is revoked successfully.
 */
async function revokeSessionByRefreshToken(refreshToken) {
  const refreshTokenHash = hashRefreshToken(refreshToken);
  const { error } = await supabaseAdmin
    .from(TABLE_NAME)
    .update({ revoked: true })
    .eq("refresh_token_hash", refreshTokenHash);

  if (error) {
    logger.error(`Error revoking session by refresh token:`, error);
    return false;
  }
  return true;
}

/**
 * Lists all sessions for a user profile.
 * @param {string} profileId - User profile UUID.
 * @returns {Promise<Array<object>>} Session rows ordered by most recent use.
 */
async function listSessionsForProfile(profileId) {
  const { data, error } = await supabaseAdmin
    .from(TABLE_NAME)
    .select("id, created_at, last_used_at, device_type, ip, revoked")
    .eq("profile_id", profileId)
    .order("last_used_at", { ascending: false });

  if (error) {
    logger.error(`Error listing sessions for profile ${profileId}:`, error);
    throw error;
  }
  return data;
}

/**
 * Rotates a refresh token by revoking the old session and creating a new one.
 * @param {string} oldRefreshToken - Refresh token to revoke.
 * @param {string} newRefreshToken - New refresh token to store.
 * @param {string} profileId - User profile UUID.
 * @param {string} ip - Request IP address.
 * @param {string} userAgent - Request user agent.
 * @param {string} deviceType - Device type associated with the session.
 * @returns {Promise<object>} Newly created session row.
 */
async function rotateRefreshToken(
  oldRefreshToken,
  newRefreshToken,
  profileId,
  ip,
  userAgent,
  deviceType
) {
  const revokePromise = revokeSessionByRefreshToken(oldRefreshToken);

  const createPromise = createSession({
    profile_id: profileId,
    refresh_token: newRefreshToken,
    ip,
    user_agent: userAgent,
    device_type: deviceType,
  });

  const [revoked, newSession] = await Promise.all([
    revokePromise,
    createPromise,
  ]);

  if (!revoked) {
    logger.warn(
      `Failed to revoke old session for refresh token hash: ${hashRefreshToken(
        oldRefreshToken
      )}`
    );
  }

  return newSession;
}

export const sessionService = {
  createSession,
  findSessionByRefreshToken,
  revokeSessionById,
  revokeSessionByRefreshToken,
  listSessionsForProfile,
  rotateRefreshToken,
};
