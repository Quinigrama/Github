export interface ReducedSystem {
  id: string;
  name: string;
  baseNumbersCount: number;
  combinationsCount: number;
  description: string;
}

export const REDUCED_SYSTEMS: { [gameId: string]: ReducedSystem[] } = {
  bonoloto: [
    {
      id: 'reduced-8-5-5',
      name: '8 Números; garantizados 5 aciertos si caen los 6 (4 apuestas - 2,00 €)',
      baseNumbersCount: 8,
      combinationsCount: 4,
      description: 'Garantiza al menos un premio de 5 aciertos si entre tus 8 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-10-5-5',
      name: '10 Números; garantizados 5 aciertos si caen los 6 (14 apuestas - 7,00 €)',
      baseNumbersCount: 10,
      combinationsCount: 14,
      description: 'Garantiza al menos un premio de 5 aciertos si entre tus 10 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-12-5-5',
      name: '12 Números; garantizados 5 aciertos si caen los 6 (42 apuestas - 21,00 €)',
      baseNumbersCount: 12,
      combinationsCount: 42,
      description: 'Garantiza al menos un premio de 5 aciertos si entre tus 12 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-10-4-4',
      name: '10 Números; garantizados 4 aciertos si caen los 6 (3 apuestas - 1,50 €)',
      baseNumbersCount: 10,
      combinationsCount: 3,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 10 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-12-4-4',
      name: '12 Números; garantizados 4 aciertos si caen los 6 (6 apuestas - 3,00 €)',
      baseNumbersCount: 12,
      combinationsCount: 6,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 12 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-14-4-4',
      name: '14 Números; garantizados 4 aciertos si caen los 6 (17 apuestas - 8,50 €)',
      baseNumbersCount: 14,
      combinationsCount: 17,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 14 números elegidos están los 6 ganadores.'
    }
  ],
  primitiva: [
    {
      id: 'reduced-8-5-5',
      name: '8 Números; garantizados 5 aciertos si caen los 6 (4 apuestas - 4,00 €)',
      baseNumbersCount: 8,
      combinationsCount: 4,
      description: 'Garantiza al menos un premio de 5 aciertos si entre tus 8 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-10-5-5',
      name: '10 Números; garantizados 5 aciertos si caen los 6 (14 apuestas - 14,00 €)',
      baseNumbersCount: 10,
      combinationsCount: 14,
      description: 'Garantiza al menos un premio de 5 aciertos si entre tus 10 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-12-5-5',
      name: '12 Números; garantizados 5 aciertos si caen los 6 (42 apuestas - 42,00 €)',
      baseNumbersCount: 12,
      combinationsCount: 42,
      description: 'Garantiza al menos un premio de 5 aciertos si entre tus 12 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-10-4-4',
      name: '10 Números; garantizados 4 aciertos si caen los 6 (3 apuestas - 3,00 €)',
      baseNumbersCount: 10,
      combinationsCount: 3,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 10 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-12-4-4',
      name: '12 Números; garantizados 4 aciertos si caen los 6 (6 apuestas - 6,00 €)',
      baseNumbersCount: 12,
      combinationsCount: 6,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 12 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-14-4-4',
      name: '14 Números; garantizados 4 aciertos si caen los 6 (17 apuestas - 17,00 €)',
      baseNumbersCount: 14,
      combinationsCount: 17,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 14 números elegidos están los 6 ganadores.'
    }
  ],
  eurodreams: [
    {
      id: 'reduced-8-5-5',
      name: '8 Números; garantizados 5 aciertos si caen los 6 (4 apuestas - 10,00 €)',
      baseNumbersCount: 8,
      combinationsCount: 4,
      description: 'Garantiza al menos un premio de 5 aciertos si entre tus 8 números elegidos están los 6 ganadores (1 Sueño fijo).'
    },
    {
      id: 'reduced-10-5-5',
      name: '10 Números; garantizados 5 aciertos si caen los 6 (14 apuestas - 35,00 €)',
      baseNumbersCount: 10,
      combinationsCount: 14,
      description: 'Garantiza al menos un premio de 5 aciertos si entre tus 10 números elegidos están los 6 ganadores (1 Sueño fijo).'
    },
    {
      id: 'reduced-12-5-5',
      name: '12 Números; garantizados 5 aciertos si caen los 6 (42 apuestas - 105,00 €)',
      baseNumbersCount: 12,
      combinationsCount: 42,
      description: 'Garantiza al menos un premio de 5 aciertos si entre tus 12 números elegidos están los 6 ganadores (1 Sueño fijo).'
    },
    {
      id: 'reduced-10-4-4',
      name: '10 Números; garantizados 4 aciertos si caen los 6 (3 apuestas - 7,50 €)',
      baseNumbersCount: 10,
      combinationsCount: 3,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 10 números elegidos están los 6 ganadores (1 Sueño fijo).'
    },
    {
      id: 'reduced-12-4-4',
      name: '12 Números; garantizados 4 aciertos si caen los 6 (6 apuestas - 15,00 €)',
      baseNumbersCount: 12,
      combinationsCount: 6,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 12 números elegidos están los 6 ganadores (1 Sueño fijo).'
    },
    {
      id: 'reduced-14-4-4',
      name: '14 Números; garantizados 4 aciertos si caen los 6 (17 apuestas - 42,50 €)',
      baseNumbersCount: 14,
      combinationsCount: 17,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 14 números elegidos están los 6 ganadores (1 Sueño fijo).'
    }
  ],
  gordo: [
    {
      id: 'reduced-8-4-4',
      name: '8 Números; garantizados 4 aciertos si caen los 5 (5 apuestas - 7,50 €)',
      baseNumbersCount: 8,
      combinationsCount: 5,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 8 números elegidos están los 5 ganadores (1 Clave fija).'
    },
    {
      id: 'reduced-10-4-4',
      name: '10 Números; garantizados 4 aciertos si caen los 5 (21 apuestas - 31,50 €)',
      baseNumbersCount: 10,
      combinationsCount: 21,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 10 números elegidos están los 5 ganadores (1 Clave fija).'
    },
    {
      id: 'reduced-12-4-4',
      name: '12 Números; garantizados 4 aciertos si caen los 5 (40 apuestas - 60,00 €)',
      baseNumbersCount: 12,
      combinationsCount: 40,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 12 números elegidos están los 5 ganadores (1 Clave fija).'
    },
    {
      id: 'reduced-10-3-3',
      name: '10 Números; garantizados 3 aciertos si caen los 5 (2 apuestas - 3,00 €)',
      baseNumbersCount: 10,
      combinationsCount: 2,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 10 números elegidos están los 5 ganadores (1 Clave fija).'
    },
    {
      id: 'reduced-12-3-3',
      name: '12 Números; garantizados 3 aciertos si caen los 5 (6 apuestas - 9,00 €)',
      baseNumbersCount: 12,
      combinationsCount: 6,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 12 números elegidos están los 5 ganadores (1 Clave fija).'
    },
    {
      id: 'reduced-15-3-3',
      name: '15 Números; garantizados 3 aciertos si caen los 5 (14 apuestas - 21,00 €)',
      baseNumbersCount: 15,
      combinationsCount: 14,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 15 números elegidos están los 5 ganadores (1 Clave fija).'
    }
  ],
  euromillones: [
    {
      id: 'reduced-8-4-4',
      name: '8 Números; garantizados 4 aciertos si caen los 5 (5 apuestas - 12,50 €)',
      baseNumbersCount: 8,
      combinationsCount: 5,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 8 números elegidos están los 5 ganadores (2 estrellas fijas).'
    },
    {
      id: 'reduced-10-4-4',
      name: '10 Números; garantizados 4 aciertos si caen los 5 (21 apuestas - 52,50 €)',
      baseNumbersCount: 10,
      combinationsCount: 21,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 10 números elegidos están los 5 ganadores (2 estrellas fijas).'
    },
    {
      id: 'reduced-12-4-4',
      name: '12 Números; garantizados 4 aciertos si caen los 5 (40 apuestas - 100,00 €)',
      baseNumbersCount: 12,
      combinationsCount: 40,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 12 números elegidos están los 5 ganadores (2 estrellas fijas).'
    },
    {
      id: 'reduced-10-3-3',
      name: '10 Números; garantizados 3 aciertos si caen los 5 (2 apuestas - 5,00 €)',
      baseNumbersCount: 10,
      combinationsCount: 2,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 10 números elegidos están los 5 ganadores (2 estrellas fijas).'
    },
    {
      id: 'reduced-12-3-3',
      name: '12 Números; garantizados 3 aciertos si caen los 5 (6 apuestas - 15,00 €)',
      baseNumbersCount: 12,
      combinationsCount: 6,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 12 números elegidos están los 5 ganadores (2 estrellas fijas).'
    },
    {
      id: 'reduced-15-3-3',
      name: '15 Números; garantizados 3 aciertos si caen los 5 (14 apuestas - 35,00 €)',
      baseNumbersCount: 15,
      combinationsCount: 14,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 15 números elegidos están los 5 ganadores (2 estrellas fijas).'
    }
  ],
  nacional: [],
  powerball: [
    {
      id: 'reduced-8-4-4',
      name: '8 Blancas; garantizados 4 aciertos si caen los 5 (5 apuestas)',
      baseNumbersCount: 8,
      combinationsCount: 5,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 8 números elegidos caen los 5 ganadores.'
    },
    {
      id: 'reduced-10-4-4',
      name: '10 Blancas; garantizados 4 aciertos si caen los 5 (21 apuestas)',
      baseNumbersCount: 10,
      combinationsCount: 21,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 10 números elegidos caen los 5 ganadores.'
    },
    {
      id: 'reduced-12-4-4',
      name: '12 Blancas; garantizados 4 aciertos si caen los 5 (40 apuestas)',
      baseNumbersCount: 12,
      combinationsCount: 40,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 12 números elegidos caen los 5 ganadores.'
    },
    {
      id: 'reduced-10-3-3',
      name: '10 Blancas; garantizados 3 aciertos si caen los 5 (2 apuestas)',
      baseNumbersCount: 10,
      combinationsCount: 2,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 10 números elegidos caen los 5 ganadores.'
    },
    {
      id: 'reduced-12-3-3',
      name: '12 Blancas; garantizados 3 aciertos si caen los 5 (6 apuestas)',
      baseNumbersCount: 12,
      combinationsCount: 6,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 12 números elegidos caen los 5 ganadores.'
    },
    {
      id: 'reduced-15-3-3',
      name: '15 Blancas; garantizados 3 aciertos si caen los 5 (14 apuestas)',
      baseNumbersCount: 15,
      combinationsCount: 14,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 15 números elegidos caen los 5 ganadores.'
    }
  ],
  megamillions: [
    {
      id: 'reduced-8-4-4',
      name: '8 Blancas; garantizados 4 aciertos si caen los 5 (5 apuestas - $10.00)',
      baseNumbersCount: 8,
      combinationsCount: 5,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 8 números elegidos caen los 5 ganadores (1 Mega Ball fija).'
    },
    {
      id: 'reduced-10-4-4',
      name: '10 Blancas; garantizados 4 aciertos si caen los 5 (21 apuestas - $42.00)',
      baseNumbersCount: 10,
      combinationsCount: 21,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 10 números elegidos caen los 5 ganadores (1 Mega Ball fija).'
    },
    {
      id: 'reduced-12-4-4',
      name: '12 Blancas; garantizados 4 aciertos si caen los 5 (40 apuestas - $80.00)',
      baseNumbersCount: 12,
      combinationsCount: 40,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 12 números elegidos caen los 5 ganadores (1 Mega Ball fija).'
    },
    {
      id: 'reduced-10-3-3',
      name: '10 Blancas; garantizados 3 aciertos si caen los 5 (2 apuestas - $4.00)',
      baseNumbersCount: 10,
      combinationsCount: 2,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 10 números elegidos caen los 5 ganadores (1 Mega Ball fija).'
    },
    {
      id: 'reduced-12-3-3',
      name: '12 Blancas; garantizados 3 aciertos si caen los 5 (6 apuestas - $12.00)',
      baseNumbersCount: 12,
      combinationsCount: 6,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 12 números elegidos caen los 5 ganadores (1 Mega Ball fija).'
    },
    {
      id: 'reduced-15-3-3',
      name: '15 Blancas; garantizados 3 aciertos si caen los 5 (14 apuestas - $28.00)',
      baseNumbersCount: 15,
      combinationsCount: 14,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 15 números elegidos caen los 5 ganadores (1 Mega Ball fija).'
    }
  ]
};
