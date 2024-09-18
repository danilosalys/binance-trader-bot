require("dotenv").config();
const fs = require("fs");
const Binance = require("binance-api-node").default;
const { RSI, MACD, BollingerBands, EMA } = require("technicalindicators");

// Conecta à API da Binance usando as chaves de API e segredo
const client = Binance({
	apiKey: process.env.API_KEY,
	apiSecret: process.env.API_SECRET,
});

// Carrega o arquivo de configuração
const config = require("./config.json");
let balance = config.initialAmount; // Valor inicial de BRL para o backtest
let btcBalance = 0; // Saldo em BTC após a compra
let position = null; // Controle da posição atual: "comprado" ou "vendido"
let buyPrice = 0; // Preço de compra do BTC

// Função para obter os candles históricos em lotes
async function getHistoricalData(
	symbol,
	interval,
	startTime,
	endTime,
	limit = 1000
) {
	try {
		let allCandles = [];
		let finished = false;
		let start = startTime;

		while (!finished) {
			// Pegando candles de 1000 em 1000, que é o limite da Binance
			const candles = await client.candles({
				symbol: symbol,
				interval: interval,
				startTime: start,
				endTime: endTime,
				limit: limit,
			});

			if (candles.length === 0) {
				finished = true; // Terminou de pegar os dados
			} else {
				// Adiciona os candles baixados à lista total
				allCandles = allCandles.concat(candles);
				start = candles[candles.length - 1].closeTime; // Atualiza o tempo de início para o próximo lote
			}
		}
		return allCandles;
	} catch (error) {
		console.error("Erro ao buscar dados históricos:", error);
	}
}

// Funções de cálculo de indicadores (RSI, MACD, Bollinger Bands, EMA)
function calculateRSI(closePrices, period) {
	return RSI.calculate({ values: closePrices, period: period });
}

function calculateMACD(closePrices, fastPeriod, slowPeriod, signalPeriod) {
	return MACD.calculate({
		values: closePrices,
		fastPeriod: fastPeriod,
		slowPeriod: slowPeriod,
		signalPeriod: signalPeriod,
		SimpleMAOscillator: false,
		SimpleMASignal: false,
	});
}

function calculateBollingerBands(closePrices, period, stdDev) {
	return BollingerBands.calculate({
		values: closePrices,
		period: period,
		stdDev: stdDev,
	});
}

function calculateEMA(closePrices, period) {
	return EMA.calculate({ values: closePrices, period: period });
}

function analyzeVolume(candles) {
	const volumes = candles.map((candle) => parseFloat(candle.volume));
	const avgVolume = volumes.reduce((a, b) => a + b) / volumes.length;
	const latestVolume = volumes[volumes.length - 1];
	return { avgVolume, latestVolume };
}

// Função de backtest
async function backtest(symbol, startTime, endTime) {
	try {
		// Pega os candles históricos desde o início até o final
		const candles = await getHistoricalData(
			symbol,
			config.candleTime,
			startTime,
			endTime
		);

		// Itera sobre os dados históricos e simula a estratégia
		for (let i = 50; i < candles.length; i++) {
			// Começa em i=50 para garantir janelas de cálculo suficientes
			const closePrices = candles
				.slice(i - 50, i)
				.map((c) => parseFloat(c.close)); // Pega os últimos 50 candles

			const currentCandle = candles[i];
			if (position === null) {
				await detectBuyOpportunityFromHistorical(closePrices, currentCandle);
			} else if (position === "comprado") {
				await detectSellOpportunityFromHistorical(closePrices, currentCandle);
			}
		}
	} catch (error) {
		console.error("Erro ao executar backtest:", error);
	}
}

// Função para detectar oportunidade de compra no backtest
async function detectBuyOpportunityFromHistorical(closePrices, candle) {
	const rsiValues = calculateRSI(closePrices, 14);
	const macdValues = calculateMACD(closePrices, 12, 26, 9);
	const bbValues = calculateBollingerBands(closePrices, 20, 2);
	const { avgVolume, latestVolume } = analyzeVolume([candle]); // Volume só do candle atual
	const ema50 = calculateEMA(closePrices, 50);

	// Obter os valores mais recentes
	const latestRSI = rsiValues[rsiValues.length - 1];
	const latestMACD = macdValues[macdValues.length - 1];
	const latestBB = bbValues[bbValues.length - 1];
	const latestClose = closePrices[closePrices.length - 1];

	// Condições de compra simuladas
	if (
		latestRSI < config.RSI &&
		latestMACD.MACD > latestMACD.signal &&
		latestClose <= latestBB.lower &&
		latestVolume >= avgVolume
	) {
		// Compra detectada
		position = "comprado";
		buyPrice = latestClose; // Armazena o preço de compra
		const candleDate = new Date(candle.closeTime).toLocaleString();
		console.log(
			`Compra detectada no candle de ${candleDate}. Preço: ${latestClose}`
		);

		// Compra usando 100% do saldo em BRL para BTC
		btcBalance = balance / latestClose; // Converte todo o saldo em BTC
		console.log(`Quantidade comprada: ${btcBalance} BTC`);
		balance = 0; // Todo o saldo foi convertido para BTC
	}
}

// Função para detectar oportunidade de venda no backtest
async function detectSellOpportunityFromHistorical(closePrices, candle) {
	const latestClose = closePrices[closePrices.length - 1];
	const targetPrice = buyPrice * config.profitPercentage; // Define a meta de 1% de lucro com base no preço de compra

	// Se o preço atual atinge a meta de lucro de 1%
	if (latestClose >= targetPrice) {
		position = null; // Libera a posição para a próxima compra
		const candleDate = new Date(candle.closeTime).toLocaleString();
		console.log(
			`Venda detectada no candle de ${candleDate}. Preço: ${latestClose}`
		);
		// Converte BTC de volta para BRL
		balance = btcBalance * latestClose; // Converte todo o BTC de volta para saldo em BRL
		btcBalance = 0; // Zera o saldo de BTC após a venda
		console.log(`Novo saldo após venda: R$ ${balance}`);
	}
}

// Função principal de monitoramento
async function monitorarMercado() {
	// Verifica o modo de operação no arquivo JSON
	if (config.mode === "backtest") {
		const startTime = new Date(config.startTime).getTime();
		const endTime =
			config.endTime === "now"
				? Date.now()
				: new Date(config.endTime).getTime();
		await backtest(config.symbol, startTime, endTime);
	} else if (config.mode === "real") {
		console.log("Modo de operação real não implementado no backtest.");
	}
}

// Executa a função de monitoramento
monitorarMercado();
