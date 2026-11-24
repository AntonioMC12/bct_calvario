export const managementRoles = Object.freeze(['admin', 'director']);
export const canManage = role => managementRoles.includes(role);
