// SPDX-License-Identifier: GPL-3.0-or-later
// Where list updates come from, and the key they must be signed with. A test build swaps this one file.
// UPDATE_PUBLIC_KEY is the Ed25519 public key whose private half signs version.json on cpab.cyclone9.dev,
// as base64 of its 32 raw bytes. List data is used only when its signature checks out against it.
export const UPDATE_BASE = 'https://cpab.cyclone9.dev/data/v1/';
export const UPDATE_PUBLIC_KEY = '/NgIbUcEIC+SAj0L5LAL1LA/znDeU/HSibrl47tjsQ8=';

// Where a newer version is downloaded from. A code constant, never data: the data never chooses where a
// person is sent.
export const RELEASE_URL = 'https://github.com/cyclone9/CPAB';
