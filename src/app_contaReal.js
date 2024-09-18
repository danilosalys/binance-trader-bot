require("dotenv").config();
const config = require("./config.json");
const Binance = require("binance-api-node").default;
const fs = require("fs");
const { RSI, MACD, BollingerBands, EMA, SMA } = require("technicalindicators");

// Conecta à API da Binance usando as chaves de API e segredo
const client = Binance({
  apiKey: process.env.API_KEY,
  apiSecret: process.env.SECRET_KEY,
});

// Função para verificar o saldo da conta e filtrar BTC e BRL
async function checkBalance() {
  try {
    const accountInfo = await client.accountInfo();
    const balances = accountInfo.balances;

    // Filtra os saldos de BTC e BRL
    const btcBalance = balances.find((b) => b.asset === "BTC");
    const brlBalance = balances.find((b) => b.asset === "BRL");

    console.log("Saldo BTC:", btcBalance ? btcBalance.free : "0");
    console.log("Saldo BRL:", brlBalance ? brlBalance.free : "0");
  } catch (error) {
    console.error("Erro ao buscar o saldo:", error);
  }
}



// Função para obter o preço atual do Bitcoin
async function getBitcoinPrice() {
  try {
    // Pega os preços do par BTC/USDT (ou BTC/BRL se preferir)
    const prices = await client.prices();

    const btcPriceInUSDT = prices.BTCUSDT; // Preço em USD
    const btcPriceInBRL = prices.BTCBRL; // Preço em BRL (se disponível)

    console.log("Preço atual do Bitcoin (BTC/USDT):", btcPriceInUSDT);
    if (btcPriceInBRL) {
      console.log("Preço atual do Bitcoin (BTC/BRL):", btcPriceInBRL);
    } else {
      console.log("Preço BTC/BRL não disponível.");
    }
  } catch (error) {
    console.error("Erro ao buscar o preço do Bitcoin:", error);
  }
}


// Função para obter dados de candles com suporte a múltiplos lotes
async function getCandlesInBatches(symbol, interval, startTime, endTime, limit) {
	let allCandles = [];
	let currentStartTime = startTime;
  
	while (currentStartTime < endTime) {
	  const candles = await client.candles({
		symbol: symbol,
		interval: interval,
		startTime: currentStartTime,
		limit: limit,
	  });

	  // Adicionando candleTimeBrasilia para cada candle
		const candlesWithBrasiliaTime = candles.map(candle => {
			const candleTimeBrasilia = new Date(candle.openTime - config.timeZoneBrasiliaTimestamp).toISOString(); // Converte para horário de Brasília
			return {
				...candle, // Mantém os dados originais do candle
				candleTimeBrasilia // Adiciona o campo candleTimeBrasilia com horário ajustado
			};
		});
  
	  if (candlesWithBrasiliaTime.length === 0) break; // Se não houver mais candles, pare o loop

  
	  allCandles = allCandles.concat(candlesWithBrasiliaTime);
  
	  // Atualiza o tempo de início para o próximo lote
	  currentStartTime = candles[candles.length - 1].closeTime;
	  
	  // Log do progresso
	  console.log(`Obtidos ${candles.length} candles, total: ${allCandles.length}`);
	}

  
	return allCandles;
  }



// Função para obter os candles históricos
async function getCandleData(symbol, interval, limit) {
	try {
		const candles = await client.candles({
			symbol: symbol,
			interval: interval,
			limit: limit,
		});

		// Adicionando candleTimeBrasilia para cada candle
		const candlesWithBrasiliaTime = candles.map(candle => {
			const candleTimeBrasilia = new Date(candle.openTime - config.timeZoneBrasiliaTimestamp).toISOString(); // Converte para horário de Brasília
			return {
				...candle, // Mantém os dados originais do candle
				candleTimeBrasilia // Adiciona o campo candleTimeBrasilia com horário ajustado
			};
		});

		// Exibindo o primeiro candle para verificar o resultado

		return candlesWithBrasiliaTime;
	} catch (error) {
		console.error("Erro ao buscar dados de candlestick:", error);
	}
}



// Função para calcular o RSI de todos os candles
function calculateRSIForCandles(candles, period) {
    const closePrices = candles.map((candle) => parseFloat(candle.close)); // Extrai os preços de fechamento

    // Calcula o RSI para todos os candles, incluindo os extras
    const rsiValues = RSI.calculate({
        values: closePrices,
        period: period,
    });

    // Associa o RSI ao candle (ajusta para remover os primeiros candles extras)
    const rsiWithCandles = candles.map((candle, index) => {
        return {
            ...candle, // Mantém os dados originais do candle
            rsi: index >= period ? rsiValues[index - period] : null, // Associa o valor RSI correto
        };
    });

    return rsiWithCandles;	
}

// Função para calcular o MACD de todos os candles
function calculateMACDForCandles(candles, fastPeriod, slowPeriod, signalPeriod) {
    const closePrices = candles.map((candle) => parseFloat(candle.close)); // Extrai os preços de fechamento

    // Calcula o MACD para todos os candles, incluindo os extras
    const macdValues = MACD.calculate({
        values: closePrices,
        fastPeriod: fastPeriod,    // Ex: 12 períodos
        slowPeriod: slowPeriod,    // Ex: 26 períodos
        signalPeriod: signalPeriod, // Ex: 9 períodos
        SimpleMAOscillator: false,  // Usamos médias móveis exponenciais
        SimpleMASignal: false,
    });

    // Associa o MACD ao candle (ajusta para remover os primeiros candles extras)
    const macdWithCandles = candles.map((candle, index) => {
        const macdData = index+1 >= slowPeriod ? macdValues[index+1 - slowPeriod] : null;
        return {
            ...candle, // Mantém os dados originais do candle
            histogram: macdData ? macdData.histogram==undefined? null: macdData.histogram.toFixed() : null,
			macd: macdData ?    macdData.MACD ==undefined ? null: macdData.MACD.toFixed() : null,       // Linha MACD
            signal: macdData ? macdData.signal ==undefined ? null: macdData.signal.toFixed() : null,   // Linha de Sinal
             // Histograma (MACD - Signal)
        };
    });

    return macdWithCandles;
}




// Função para calcular o RSI
function calculateRSI(closePrices, period) {
  return RSI.calculate({
    values: closePrices,
    period: period,
  });
}

// Função para calcular o MACD
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

// Função para calcular as Bollinger Bands
function calculateBollingerBands(closePrices, period, stdDev) {
  return BollingerBands.calculate({
    values: closePrices,
    period: period,
    stdDev: stdDev,
  });
}

// Função para analisar volume
function analyzeVolume(candles) {
  const volumes = candles.map((candle) => parseFloat(candle.volume));
  const avgVolume = volumes.reduce((a, b) => a + b) / volumes.length;
  const latestVolume = volumes[volumes.length - 1];
  return { avgVolume, latestVolume };
}

// Função para calcular a SMA
function calculateSMA(closePrices, period) {
  return SMA.calculate({
    values: closePrices,
    period: period,
  });
}

// Função para calcular a EMA
function calculateEMA(closePrices, period) {
  return EMA.calculate({
    values: closePrices,
    period: period,
  });
}

// Função para detectar Doji
function isDoji(candles) {
  const lastCandle = candles[candles.length - 1];
  const bodySize = Math.abs(
    parseFloat(lastCandle.open) - parseFloat(lastCandle.close)
  );
  const candleRange = parseFloat(lastCandle.high) - parseFloat(lastCandle.low);

  // O Doji ocorre quando o corpo do candle é muito pequeno em relação à sua faixa total
  return bodySize <= 0.1 * candleRange;
}

// Função para verificar divergência de alta no RSI
function checkRSIDivergence(closePrices, rsiValues) {
  const lastPrice = closePrices[closePrices.length - 1];
  const prevPrice = closePrices[closePrices.length - 2];
  const lastRSI = rsiValues[rsiValues.length - 1];
  const prevRSI = rsiValues[rsiValues.length - 2];

  // Divergência de alta: o preço faz mínimas mais baixas, mas o RSI faz mínimas mais altas
  return lastPrice < prevPrice && lastRSI > prevRSI;
}

// Função para verificar se há um pico de volume
function isVolumeSpike(latestVolume, avgVolume, threshold = 1.5) {
  return latestVolume > threshold * avgVolume;
}

// Função para colocar uma ordem de compra
async function placeBuyOrder(symbol, quantity) {
  try {
    const order = await client.order({
      symbol: symbol,
      side: "BUY",
      type: "MARKET",
      quantity: quantity,
    });
    console.log("Ordem de compra realizada:", order);
  } catch (error) {
    console.error("Erro ao realizar a ordem de compra:", error);
  }
}

// Função de trade para detectar oportunidades de compra após correção
async function detectBuyOpportunity(
  symbol,
  rsiPeriod,
  macdFastPeriod,
  macdSlowPeriod,
  macdSignalPeriod,
  bbPeriod,
  bbStdDev
) {
  try {
    // Obter dados de candlestick com intervalo de 15 minutos
    const candles = await getCandleData(symbol, "1m", config.limitCandles);
    const closePrices = candles.map((candle) => parseFloat(candle.close));

    // Calcular RSI, MACD, Bollinger Bands, Volume, e EMA
    const rsiValues = calculateRSI(closePrices, rsiPeriod);
    const macdValues = calculateMACD(
      closePrices,
      macdFastPeriod,
      macdSlowPeriod,
      macdSignalPeriod
    );
    const bbValues = calculateBollingerBands(closePrices, bbPeriod, bbStdDev);
    const { avgVolume, latestVolume } = analyzeVolume(candles);
    const ema50 = calculateEMA(closePrices, 50);

    // Obter os valores mais recentes
    const latestRSI = rsiValues[rsiValues.length - 1];
    const latestMACD = macdValues[macdValues.length - 1];
    const latestBB = bbValues[bbValues.length - 1];
    const latestClose = closePrices[closePrices.length - 1];
    const latestEMA50 = ema50[ema50.length - 1];

    console.log(`RSI atual: ${latestRSI}`);
    console.log(`MACD atual:`, latestMACD);
    console.log(
      `Bollinger Bands superior: ${latestBB.upper}, inferior: ${latestBB.lower}`
    );
    console.log(`Volume médio: ${avgVolume}, Volume atual: ${latestVolume}`);
    console.log(`EMA de 50 períodos: ${latestEMA50}`);

    // Condições para compra

    // 1. Verificação de Correção com RSI (Abaixo de 60)
    if (latestRSI < 60) {
      console.log("RSI abaixo de 60: possível correção detectada.");

      // 2. Cruzamento de Alta no MACD
      if (latestMACD.MACD > latestMACD.signal) {
        console.log("Cruzamento de alta no MACD: sinal de compra confirmado.");

        // 3. Preço acima da EMA de 50 períodos
        if (latestClose > latestEMA50) {
          console.log(
            "Preço está acima da EMA de 50 períodos: tendência de alta confirmada."
          );

          // 4. Preço próximo à banda inferior de Bollinger
          if (latestClose <= latestBB.lower) {
            console.log(
              "Preço próximo à banda inferior de Bollinger: ótima oportunidade de compra."
            );

            // 5. Verificação de volume acima da média
            if (latestVolume >= avgVolume) {
              console.log(
                "Volume atual acima da média: confirmando força no mercado."
              );

              // 6. Verificação de divergência no RSI
              if (checkRSIDivergence(closePrices, rsiValues)) {
                console.log(
                  "Divergência de alta no RSI detectada: sinal de compra."
                );

                // Colocar ordem de compra
                // await placeBuyOrder(symbol, 0.001); // Exemplo: Comprar 0.001 BTC
                console.log("TACALEPAU MARCO VEIO!!!");
              }
            }
          }
        }
      }
    } else {
      console.log(
        "RSI ainda muito elevado. Aguardando melhor oportunidade de compra."
      );
    }
  } catch (error) {
    console.error("Erro ao detectar oportunidade de compra:", error);
  }
}

// Função principal para monitorar o mercado
async function monitorarMercado() {
	const { symbol, startTime, endTime, limitCandles, rsiPeriod, MACD, candleTime, timeZoneBrasiliaTimestamp } = config;

	const startTimestamp = new Date(startTime).getTime() + timeZoneBrasiliaTimestamp;
	const endTimestamp = endTime === "now" ? Date.now() : new Date(endTime).getTime() + timeZoneBrasiliaTimestamp;

	// Obter candles históricos em lotes até cobrir todo o período
	const candles = await getCandlesInBatches(symbol, candleTime, startTimestamp, endTimestamp, limitCandles);

	// Calcular RSI e MACD para todos os candles
	const candlesWithRSI = calculateRSIForCandles(candles, rsiPeriod);
	const candlesWithRSIAndMACD = calculateMACDForCandles(candlesWithRSI, MACD.macdFastPeriod, MACD.macdSlowPeriod, MACD.macdSignalPeriod);

	// Abrir o stream de log uma vez
	const logStream = fs.createWriteStream(`c:/temp/logBinance.txt${candleTime}`, { flags: 'a' });

	// Exibir e gravar os dados calculados
	candlesWithRSIAndMACD.forEach((candle, index) => {
		const logMessage = `Candle ${index} ${candle.candleTimeBrasilia}: Fechamento = ${candle.close}, RSI = ${candle.rsi}, Histograma = ${candle.histogram}, MACD = ${candle.macd}, Sinal = ${candle.signal}`;
		logStream.write(`${logMessage}\n`);
	});

	// Fechar o stream de log após todas as gravações
	logStream.end();
	console.log("Fim");
}

// Chamar a função para monitorar e calcular o RSI e MACD
monitorarMercado();
