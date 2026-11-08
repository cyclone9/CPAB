// SPDX-License-Identifier: GPL-3.0-or-later
// The first-run page (PRD F17). It opens on a first install only: an update, a reload in developer
// mode and a Chrome update all report another reason.
export const WELCOME_PAGE = 'welcome/welcome.html';

export const opensWelcome = (details) => details?.reason === 'install';
