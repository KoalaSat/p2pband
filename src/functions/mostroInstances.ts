// Single registry of the Mostro instances the aggregator knows about. Adding an
// instance used to mean touching four parallel lists that silently drifted apart;
// everything downstream is now derived from this one array.
//
// This lives in its own module rather than in `functions/index.ts` because
// `context/NostrEventsContext.tsx` needs `mostroPubkeys` while `functions/index.ts`
// already imports `isEventExpired` from that context — putting it in the index
// would close an import cycle. Nothing here imports from the project.
export interface MostroInstance {
  pubkey: string;
  /** Source label in the table, and the logo filename in public/assets. */
  name: string;
  region: string;
  /** Authoritative relay: the source of truth for this instance's pending orders. */
  authRelays: string[];
}

export const MOSTRO_INSTANCES: MostroInstance[] = [
  {
    // The flagship instance keeps the bare `mostro` source tag, so it is not renamed.
    pubkey: '82fa8cb978b43c79b2156585bac2c011176a21d2aead6d9f7c575c005be88390',
    name: 'mostro',
    region: 'Global',
    authRelays: ['wss://relay.mostro.network'],
  },
  {
    pubkey: '0000cc02101ec29eea9ce623258752b9d7da66c27845ed26846dd0b0fc736b40',
    name: 'NostroMostro',
    region: 'España',
    authRelays: ['wss://relay.kilombino.com'],
  },
  {
    pubkey: '00000235a3e904cfe1213a8a54d6f1ec1bef7cc6bfaabd6193e82931ccf1366a',
    name: 'Kmbalache',
    region: 'Cuba',
    authRelays: ['wss://relay.mostro.network'],
  },
  {
    pubkey: '00000978acc594c506976c655b6decbf2d4af25ffdaa6680f2a9568b0a88441b',
    name: 'MostroColombia',
    region: 'Colombia',
    authRelays: ['wss://relay.mostro.network'],
  },
  {
    pubkey: '00007cb3305fb972f5cc83f83a8fbca1e64e93c9d1369880a9fd62ef95d23f91',
    name: 'MostroBolivia',
    region: 'Bolivia',
    authRelays: ['wss://relay.mostro.network'],
  },
  {
    pubkey: '000009ee1e4b1dc7add19ab30e4ef854d7b562e208b62686fd9002b50b24dabb',
    name: 'MostroVenezuela',
    region: 'Venezuela',
    authRelays: ['wss://relay.mostro.network'],
  },
  {
    pubkey: '00037abd44e7a846689e230d5446abcd0d56a344fa81fff85c09d1929feda486',
    name: 'MostroBrasil',
    region: 'Brasil',
    authRelays: ['wss://relay.mostro.network'],
  },
  {
    pubkey: 'b3626fe91b602bdbca3673bec0855221f41dc8f6d0e4027e51eaa525d68d87f2',
    name: 'MostroAr',
    region: 'Argentina',
    authRelays: ['wss://relay.mostro.network'],
  },
];

export const mostroPubkeys = MOSTRO_INSTANCES.map(instance => instance.pubkey);

export const MOSTRO_SOURCES = MOSTRO_INSTANCES.map(instance => instance.name);

// Rewrites the generic `mostro` source tag to the issuing instance. A no-op for the
// flagship, whose name is `mostro` already.
export const mostroInstanceNames: Record<string, string> = {};

export const mostroAuthRelays: Record<string, string[]> = {};

MOSTRO_INSTANCES.forEach(instance => {
  mostroInstanceNames[instance.pubkey] = instance.name;
  mostroAuthRelays[instance.pubkey] = instance.authRelays;
});
