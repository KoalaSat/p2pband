import { isMostroOrderValid, MostroValidation } from 'functions';

const MOSTRO_MAIN = '82fa8cb978b43c79b2156585bac2c011176a21d2aead6d9f7c575c005be88390';
const NOSTRO_MOSTRO = '0000cc02101ec29eea9ce623258752b9d7da66c27845ed26846dd0b0fc736b40';

const validation = (validatedPubkeys: string[], dTags: string[]): MostroValidation => ({
  validatedPubkeys: new Set(validatedPubkeys),
  dTags: new Set(dTags),
});

describe('isMostroOrderValid', () => {
  it('keeps every order while the validation is still loading', () => {
    const order = { source: 'mostro', pubkey: MOSTRO_MAIN, dTag: 'order-1' };

    expect(isMostroOrderValid(order, null)).toBe(true);
  });

  // Regression: relay.mostro.network returning 502 used to produce an empty
  // (but non-null) validation set, which wiped every Mostro order off the book.
  it('keeps orders from an instance whose authoritative relay did not answer', () => {
    const order = { source: 'mostro', pubkey: MOSTRO_MAIN, dTag: 'order-1' };

    expect(isMostroOrderValid(order, validation([], []))).toBe(true);
  });

  it('keeps an order confirmed by its authoritative relay', () => {
    const order = { source: 'mostro', pubkey: MOSTRO_MAIN, dTag: 'order-1' };

    expect(isMostroOrderValid(order, validation([MOSTRO_MAIN], [`${MOSTRO_MAIN}:order-1`]))).toBe(
      true
    );
  });

  it('drops an orphaned order missing from its authoritative relay', () => {
    const order = { source: 'mostro', pubkey: MOSTRO_MAIN, dTag: 'gone' };

    expect(isMostroOrderValid(order, validation([MOSTRO_MAIN], [`${MOSTRO_MAIN}:order-1`]))).toBe(
      false
    );
  });

  it('never filters non-Mostro sources', () => {
    const order = { source: 'robosats', pubkey: 'whatever', dTag: 'gone' };

    expect(isMostroOrderValid(order, validation([MOSTRO_MAIN], [`${MOSTRO_MAIN}:order-1`]))).toBe(
      true
    );
  });

  it('does not let one instance validate another instance d-tag', () => {
    const order = { source: 'NostroMostro', pubkey: NOSTRO_MOSTRO, dTag: 'order-1' };

    expect(
      isMostroOrderValid(
        order,
        validation([MOSTRO_MAIN, NOSTRO_MOSTRO], [`${MOSTRO_MAIN}:order-1`])
      )
    ).toBe(false);
  });

  it('keeps orders that carry no d-tag', () => {
    const order = { source: 'mostro', pubkey: MOSTRO_MAIN, dTag: undefined };

    expect(isMostroOrderValid(order, validation([MOSTRO_MAIN], []))).toBe(true);
  });
});
