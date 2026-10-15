import { randomInt } from 'node:crypto';
import express from 'express';
import { v4 } from 'uuid';
import { logger } from './logger.js';

const app = express();
const port = 3000;
const capturedHistory: number[] = [];
let lastEncounter = 0;

app.use((req, res, next) => {
    res.on('finish', () => {
        logger.info(
            { method: req.method, url: req.originalUrl, status: res.statusCode },
            'Route appelée'
        );
    });
    next();
});

async function callPoke(id: number) {
    const getpoke = await fetch('https://pokeapi.co/api/v2/pokemon/' + id);

    if (getpoke.status === 404) {
        throw new Error('NOT_FOUND');
    }
    if (!getpoke.ok) {
        throw new Error('DEPENDENCY_ERROR');
    }

    const data = await getpoke.json();
    return {
        pokemon: {
            id: data.id,
            name: data.name,
            types: data.types,
            stats: data.stats,
        },
    };
}

app.get('/', (req, res) => {
    res.send('Hello World!');
});

app.get('/wild', async (req, res) => {
    const randomId = randomInt(1, 1025);
    lastEncounter = randomId;

    try {
        const randomPoke = await callPoke(randomId);
        logger.info({ pokemonId: randomId }, 'Pokémon sauvage rencontré');
        res.status(200).json(randomPoke);
    } catch (err) {
        logger.error({ err, pokemonId: randomId }, 'Erreur PokéAPI sur /wild');
        res.status(424).json({ error: 'Donnée introuvable / problème de dépendance.' });
    }
});

app.post('/capture/:id', async (req, res) => {
    // 400 : ID invalide
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1 || id > 1025) {
        logger.warn({ rawId: req.params.id }, 'Capture refusée : ID invalide');
        res.status(400).json({ error: 'Invalid Pokémon ID' });
        return;
    }

    // 400 : ce n'est pas le dernier Pokémon rencontré
    if (id !== lastEncounter) {
        logger.warn({ id, lastEncounter }, 'Capture refusée : pas le dernier rencontré');
        res.status(400).json({ error: 'This Pokémon was not the last encounter.' });
        return;
    }

    // 409 : déjà capturé
    if (capturedHistory.includes(id)) {
        logger.warn({ id }, 'Capture refusée : déjà capturé');
        res.status(409).json({ error: 'Pokémon already captured.' });
        return;
    }

    const luck = randomInt(1, 100);
    const captureRate = randomInt(1, 100);

    if (luck < captureRate) {
        logger.info({ id }, 'Le Pokémon s\'est échappé');
        res.status(200).json({
            success: false,
            message: "Oh non ! Le Pokémon s'est échappé !",
        });
        return;
    }

    try {
        const curPoke = await callPoke(id);
        capturedHistory.unshift(id);
        logger.info({ id, name: curPoke.pokemon.name }, 'Pokémon capturé');
        res.status(201).json({
            success: true,
            captured: {
                uuid: v4(),
                pokemonId: id,
                name: curPoke.pokemon.name,
                nickname: curPoke.pokemon.name,
                capturedAt: new Date().toISOString(),
            },
        });
    } catch (err) {
        logger.error({ err, id }, 'Erreur PokéAPI sur /capture');
        if ((err as Error).message === 'NOT_FOUND') {
            res.status(404).json({ error: 'Pokémon not found.' });
            return;
        }
        res.status(424).json({ error: 'Dependency error.' });
    }
});

// 405 : mauvaise méthode sur /capture/:id
app.all('/capture/:id', (req, res) => {
    logger.warn({ method: req.method }, 'Méthode non autorisée sur /capture/:id');
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
});

app.get('/pokedex', async (req, res) => {
    try {
        const resultat = [];
        for (const id of capturedHistory) {
            resultat.push(await callPoke(id));
        }
        res.status(200).json(resultat);
    } catch (err) {
        logger.error({ err }, 'Erreur PokéAPI sur /pokedex');
        res.status(424).json({ error: 'Dependency error.' });
    }
});

// 404 : route inconnue (tout à la fin, après TOUTES les routes)
app.use((req, res) => {
    logger.warn({ method: req.method, url: req.originalUrl }, 'Route inconnue');
    res.status(404).json({ error: 'Route not found.' });
});

export { app };

if (process.env.NODE_ENV !== 'test') {
    app.listen(port, () => {
        logger.info(`Serveur démarré sur http://127.0.0.1:${port}/`);
    });
}
