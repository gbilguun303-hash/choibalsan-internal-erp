'use strict';

const CLAIM = 'https://choibalsan-hugjil.com/erp_user_id';
const MCP_AUDIENCE = 'https://choibalsan-hugjil.com/mcp';

exports.onExecutePostLogin = async (event, api) => {
  if (event.resource_server?.identifier !== MCP_AUDIENCE) return;

  const erpUserId = Number(event.user.app_metadata?.erp_user_id);
  if (!Number.isSafeInteger(erpUserId) || erpUserId <= 0) {
    api.access.deny('This Auth0 account is not linked to an active ERP user.');
    return;
  }

  api.accessToken.setCustomClaim(CLAIM, erpUserId);
};
