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
      name: '8 Números; garantizados 5 aciertos si caen los 6 (12 apuestas - 6,00 €)',
      baseNumbersCount: 8,
      combinationsCount: 12,
      description: 'Garantiza al menos un premio de 5 aciertos si entre tus 8 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-10-5-5',
      name: '10 Números; garantizados 5 aciertos si caen los 6 (56 apuestas - 28,00 €)',
      baseNumbersCount: 10,
      combinationsCount: 56,
      description: 'Garantiza al menos un premio de 5 aciertos si entre tus 10 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-12-5-5',
      name: '12 Números; garantizados 5 aciertos si caen los 6 (172 apuestas - 86,00 €)',
      baseNumbersCount: 12,
      combinationsCount: 172,
      description: 'Garantiza al menos un premio de 5 aciertos si entre tus 12 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-10-4-4',
      name: '10 Números; garantizados 4 aciertos si caen los 6 (23 apuestas - 11,50 €)',
      baseNumbersCount: 10,
      combinationsCount: 23,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 10 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-12-4-4',
      name: '12 Números; garantizados 4 aciertos si caen los 6 (53 apuestas - 26,50 €)',
      baseNumbersCount: 12,
      combinationsCount: 53,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 12 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-14-4-4',
      name: '14 Números; garantizados 4 aciertos si caen los 6 (107 apuestas - 53,50 €)',
      baseNumbersCount: 14,
      combinationsCount: 107,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 14 números elegidos están los 6 ganadores.'
    }
  ],
  primitiva: [
    {
      id: 'reduced-8-5-5',
      name: '8 Números; garantizados 5 aciertos si caen los 6 (12 apuestas - 12,00 €)',
      baseNumbersCount: 8,
      combinationsCount: 12,
      description: 'Garantiza al menos un premio de 5 aciertos si entre tus 8 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-10-5-5',
      name: '10 Números; garantizados 5 aciertos si caen los 6 (56 apuestas - 56,00 €)',
      baseNumbersCount: 10,
      combinationsCount: 56,
      description: 'Garantiza al menos un premio de 5 aciertos si entre tus 10 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-12-5-5',
      name: '12 Números; garantizados 5 aciertos si caen los 6 (172 apuestas - 172,00 €)',
      baseNumbersCount: 12,
      combinationsCount: 172,
      description: 'Garantiza al menos un premio de 5 aciertos si entre tus 12 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-10-4-4',
      name: '10 Números; garantizados 4 aciertos si caen los 6 (23 apuestas - 23,00 €)',
      baseNumbersCount: 10,
      combinationsCount: 23,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 10 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-12-4-4',
      name: '12 Números; garantizados 4 aciertos si caen los 6 (53 apuestas - 53,00 €)',
      baseNumbersCount: 12,
      combinationsCount: 53,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 12 números elegidos están los 6 ganadores.'
    },
    {
      id: 'reduced-14-4-4',
      name: '14 Números; garantizados 4 aciertos si caen los 6 (107 apuestas - 107,00 €)',
      baseNumbersCount: 14,
      combinationsCount: 107,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 14 números elegidos están los 6 ganadores.'
    }
  ],
  eurodreams: [
    {
      id: 'reduced-8-5-5',
      name: '8 Números; garantizados 5 aciertos si caen los 6 (12 apuestas - 30,00 €)',
      baseNumbersCount: 8,
      combinationsCount: 12,
      description: 'Garantiza al menos un premio de 5 aciertos si entre tus 8 números elegidos están los 6 ganadores (1 Sueño fijo).'
    },
    {
      id: 'reduced-10-5-5',
      name: '10 Números; garantizados 5 aciertos si caen los 6 (56 apuestas - 140,00 €)',
      baseNumbersCount: 10,
      combinationsCount: 56,
      description: 'Garantiza al menos un premio de 5 aciertos si entre tus 10 números elegidos están los 6 ganadores (1 Sueño fijo).'
    },
    {
      id: 'reduced-12-5-5',
      name: '12 Números; garantizados 5 aciertos si caen los 6 (172 apuestas - 430,00 €)',
      baseNumbersCount: 12,
      combinationsCount: 172,
      description: 'Garantiza al menos un premio de 5 aciertos si entre tus 12 números elegidos están los 6 ganadores (1 Sueño fijo).'
    },
    {
      id: 'reduced-10-4-4',
      name: '10 Números; garantizados 4 aciertos si caen los 6 (23 apuestas - 57,50 €)',
      baseNumbersCount: 10,
      combinationsCount: 23,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 10 números elegidos están los 6 ganadores (1 Sueño fijo).'
    },
    {
      id: 'reduced-12-4-4',
      name: '12 Números; garantizados 4 aciertos si caen los 6 (53 apuestas - 132,50 €)',
      baseNumbersCount: 12,
      combinationsCount: 53,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 12 números elegidos están los 6 ganadores (1 Sueño fijo).'
    },
    {
      id: 'reduced-14-4-4',
      name: '14 Números; garantizados 4 aciertos si caen los 6 (107 apuestas - 267,50 €)',
      baseNumbersCount: 14,
      combinationsCount: 107,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 14 números elegidos están los 6 ganadores (1 Sueño fijo).'
    }
  ],
  gordo: [
    {
      id: 'reduced-8-4-4',
      name: '8 Números; garantizados 4 aciertos si caen los 5 (23 apuestas - 34,50 €)',
      baseNumbersCount: 8,
      combinationsCount: 23,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 8 números elegidos están los 5 ganadores (1 Clave fija).'
    },
    {
      id: 'reduced-10-4-4',
      name: '10 Números; garantizados 4 aciertos si caen los 5 (53 apuestas - 79,50 €)',
      baseNumbersCount: 10,
      combinationsCount: 53,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 10 números elegidos están los 5 ganadores (1 Clave fija).'
    },
    {
      id: 'reduced-12-4-4',
      name: '12 Números; garantizados 4 aciertos si caen los 5 (132 apuestas - 198,00 €)',
      baseNumbersCount: 12,
      combinationsCount: 132,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 12 números elegidos están los 5 ganadores (1 Clave fija).'
    },
    {
      id: 'reduced-10-3-3',
      name: '10 Números; garantizados 3 aciertos si caen los 5 (19 apuestas - 28,50 €)',
      baseNumbersCount: 10,
      combinationsCount: 19,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 10 números elegidos están los 5 ganadores (1 Clave fija).'
    },
    {
      id: 'reduced-12-3-3',
      name: '12 Números; garantizados 3 aciertos si caen los 5 (33 apuestas - 49,50 €)',
      baseNumbersCount: 12,
      combinationsCount: 33,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 12 números elegidos están los 5 ganadores (1 Clave fija).'
    },
    {
      id: 'reduced-15-3-3',
      name: '15 Números; garantizados 3 aciertos si caen los 5 (62 apuestas - 93,00 €)',
      baseNumbersCount: 15,
      combinationsCount: 62,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 15 números elegidos están los 5 ganadores (1 Clave fija).'
    }
  ],
  euromillones: [
    {
      id: 'reduced-8-4-4',
      name: '8 Números; garantizados 4 aciertos si caen los 5 (23 apuestas - 57,50 €)',
      baseNumbersCount: 8,
      combinationsCount: 23,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 8 números elegidos están los 5 ganadores (2 estrellas fijas).'
    },
    {
      id: 'reduced-10-4-4',
      name: '10 Números; garantizados 4 aciertos si caen los 5 (53 apuestas - 132,50 €)',
      baseNumbersCount: 10,
      combinationsCount: 53,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 10 números elegidos están los 5 ganadores (2 estrellas fijas).'
    },
    {
      id: 'reduced-12-4-4',
      name: '12 Números; garantizados 4 aciertos si caen los 5 (132 apuestas - 330,00 €)',
      baseNumbersCount: 12,
      combinationsCount: 132,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 12 números elegidos están los 5 ganadores (2 estrellas fijas).'
    },
    {
      id: 'reduced-10-3-3',
      name: '10 Números; garantizados 3 aciertos si caen los 5 (19 apuestas - 47,50 €)',
      baseNumbersCount: 10,
      combinationsCount: 19,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 10 números elegidos están los 5 ganadores (2 estrellas fijas).'
    },
    {
      id: 'reduced-12-3-3',
      name: '12 Números; garantizados 3 aciertos si caen los 5 (33 apuestas - 82,50 €)',
      baseNumbersCount: 12,
      combinationsCount: 33,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 12 números elegidos están los 5 ganadores (2 estrellas fijas).'
    },
    {
      id: 'reduced-15-3-3',
      name: '15 Números; garantizados 3 aciertos si caen los 5 (62 apuestas - 155,00 €)',
      baseNumbersCount: 15,
      combinationsCount: 62,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 15 números elegidos están los 5 ganadores (2 estrellas fijas).'
    }
  ],
  nacional: [],
  powerball: [
    {
      id: 'reduced-8-4-4',
      name: '8 Blancas; garantizados 4 aciertos si caen los 5 (23 apuestas)',
      baseNumbersCount: 8,
      combinationsCount: 23,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 8 números elegidos caen los 5 ganadores.'
    },
    {
      id: 'reduced-10-4-4',
      name: '10 Blancas; garantizados 4 aciertos si caen los 5 (53 apuestas)',
      baseNumbersCount: 10,
      combinationsCount: 53,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 10 números elegidos caen los 5 ganadores.'
    },
    {
      id: 'reduced-12-4-4',
      name: '12 Blancas; garantizados 4 aciertos si caen los 5 (132 apuestas)',
      baseNumbersCount: 12,
      combinationsCount: 132,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 12 números elegidos caen los 5 ganadores.'
    },
    {
      id: 'reduced-10-3-3',
      name: '10 Blancas; garantizados 3 aciertos si caen los 5 (19 apuestas)',
      baseNumbersCount: 10,
      combinationsCount: 19,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 10 números elegidos caen los 5 ganadores.'
    },
    {
      id: 'reduced-12-3-3',
      name: '12 Blancas; garantizados 3 aciertos si caen los 5 (33 apuestas)',
      baseNumbersCount: 12,
      combinationsCount: 33,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 12 números elegidos caen los 5 ganadores.'
    },
    {
      id: 'reduced-15-3-3',
      name: '15 Blancas; garantizados 3 aciertos si caen los 5 (62 apuestas)',
      baseNumbersCount: 15,
      combinationsCount: 62,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 15 números elegidos caen los 5 ganadores.'
    }
  ],
  megamillions: [
    {
      id: 'reduced-8-4-4',
      name: '8 Blancas; garantizados 4 aciertos si caen los 5 (23 apuestas - $46.00)',
      baseNumbersCount: 8,
      combinationsCount: 23,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 8 números elegidos caen los 5 ganadores (1 Mega Ball fija).'
    },
    {
      id: 'reduced-10-4-4',
      name: '10 Blancas; garantizados 4 aciertos si caen los 5 (53 apuestas - $106.00)',
      baseNumbersCount: 10,
      combinationsCount: 53,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 10 números elegidos caen los 5 ganadores (1 Mega Ball fija).'
    },
    {
      id: 'reduced-12-4-4',
      name: '12 Blancas; garantizados 4 aciertos si caen los 5 (132 apuestas - $264.00)',
      baseNumbersCount: 12,
      combinationsCount: 132,
      description: 'Garantiza al menos un premio de 4 aciertos si entre tus 12 números elegidos caen los 5 ganadores (1 Mega Ball fija).'
    },
    {
      id: 'reduced-10-3-3',
      name: '10 Blancas; garantizados 3 aciertos si caen los 5 (19 apuestas - $38.00)',
      baseNumbersCount: 10,
      combinationsCount: 19,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 10 números elegidos caen los 5 ganadores (1 Mega Ball fija).'
    },
    {
      id: 'reduced-12-3-3',
      name: '12 Blancas; garantizados 3 aciertos si caen los 5 (33 apuestas - $66.00)',
      baseNumbersCount: 12,
      combinationsCount: 33,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 12 números elegidos caen los 5 ganadores (1 Mega Ball fija).'
    },
    {
      id: 'reduced-15-3-3',
      name: '15 Blancas; garantizados 3 aciertos si caen los 5 (62 apuestas - $124.00)',
      baseNumbersCount: 15,
      combinationsCount: 62,
      description: 'Garantiza al menos un premio de 3 aciertos si entre tus 15 números elegidos caen los 5 ganadores (1 Mega Ball fija).'
    }
  ]
};
