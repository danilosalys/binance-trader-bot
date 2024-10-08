const fs = require('fs');
const {Strategy, profitPercentage } = require("./src/config.json");
const expectedProfit = profitPercentage;

// Função para calcular lucro ou prejuízo
function calculateProfit(buyPrice, sellPrice, quantity) {
  return (sellPrice - buyPrice) * quantity;
}

// Função para calcular o percentual de lucro ou prejuízo
function calculateProfitPercentage(buyPrice, sellPrice) {
  return ((sellPrice - buyPrice) / buyPrice) * 100;
}

// Função para verificar se é um novo dia
function isNewDay(currentDate, lastDate) {
  const currentDay = new Date(currentDate).getUTCDate();
  const lastDay = new Date(lastDate).getUTCDate();
  return currentDay !== lastDay;
}

// Função para verificar se mudou o mês
function isNewMonth(currentDate, lastDate) {
  const currentMonth = new Date(currentDate).getUTCMonth();
  const lastMonth = new Date(lastDate).getUTCMonth();
  const currentYear = new Date(currentDate).getUTCFullYear();
  const lastYear = new Date(lastDate).getUTCFullYear();
  
  return currentMonth !== lastMonth || currentYear !== lastYear;
}

// Função para exibir o saldo final de cada mês
function getMonthlyBalance(data, initialBalance, tradedCandles) {
  let lastDate = ''; // Para rastrear o último mês
  let lastBalance = initialBalance; // Saldo inicial
  let monthlyBalances = []; // Armazenar os saldos de cada mês

  tradedCandles.forEach((trade) => {
    const candleDate = trade.date;

    // Verificar se é um novo mês
    if (lastDate && isNewMonth(candleDate, lastDate)) {
      const lastMonth = new Date(lastDate).toLocaleString('default', { month: 'long', year: 'numeric' });
      monthlyBalances.push({ month: lastMonth, balance: lastBalance });
    }

    lastBalance = trade.balanceAfterTrade || lastBalance; // Atualizar o saldo com o saldo após a operação
    lastDate = candleDate; // Atualizar a data
  });

  // Armazenar o saldo do último mês
  if (lastDate) {
    const lastMonth = new Date(lastDate).toLocaleString('default', { month: 'long', year: 'numeric' });
    monthlyBalances.push({ month: lastMonth, balance: lastBalance });
  }

  // Exibir o saldo de cada mês
  console.log("\nSaldo Final Mensal:");
  monthlyBalances.forEach((balance) => {
    console.log(`Saldo final de ${balance.month}: ${balance.balance.toFixed(2)}`);
  });
}

// Estratégia de trading baseada em RSI, MACD (sem limite de 1% de lucro diário)
function tradingStrategy(candles) {
  let balance = 1000; // Saldo inicial em reais
  let btcAmount = 0; // Quantidade de BTC em carteira
  let buyPrice = 0; // Preço em que foi comprado o ativo
  let totalProfit = 0; // Lucro total
  let lastTradeDate = ''; // Para controle do dia atual
  let waitingForProfitableSell = false; // Indica se estamos esperando uma venda favorável
  let tradedCandles = []; // Armazenar os candles negociados
  const rsiBuyThreshold = 50;  // Limite de compra para RSI
  const rsiSellThreshold = 60; // Limite de venda para RSI

  candles.forEach((candle, index) => {
    const candleNumber = candle.candleNumber;
    const closePrice = candle.close;
    const rsi = candle.rsi;
    const macd = candle.macd;
    const signal = candle.signal;
    const histogram = candle.histograma;
    const candleDate = candle.date; // Data do candle
    const ema200 = candle.EMA200

    // Verifica se é um novo dia (para outros cálculos, mas sem restrição de lucro)
    if (isNewDay(candleDate, lastTradeDate)) {
      // Aqui o dailyProfit foi removido, já que não há mais restrição de 1%
    }
    lastTradeDate = candleDate; // Atualizar data do último candle

    // Sinal de compra - Usar 100% do saldo
    
    if (rsi < rsiBuyThreshold && macd > signal && btcAmount === 0 && Strategy == 'RSI+MACD') {
      btcAmount = balance / closePrice;  // Comprar com todo o saldo disponível
      buyPrice = closePrice;
      balance = 0; // O saldo em reais agora é zero, pois foi todo usado na compra

      tradedCandles.push({ 
        date: candleDate,
        type: 'Compra', 
        candleIndex: index, 
        price: buyPrice, 
        candle,
        btcAmount,
        balanceAfterTrade: balance // O saldo após a compra é zero
      });

      console.log(`Candle: ${candleNumber} - ${candleDate} - Comprado a: Preço: ${buyPrice} | Estrategia: RSI+MACD | RSI: ${rsi} | MACD: ${histogram} ${macd} ${signal}`);
      

      waitingForProfitableSell = false; // Após a compra, não estamos esperando uma venda lucrativa
    }

    if (closePrice < ema200 && rsi < rsiBuyThreshold && macd > signal && btcAmount === 0 && Strategy == 'RSI+EMA200') {
        btcAmount = balance / closePrice;  // Comprar com todo o saldo disponível
        buyPrice = closePrice;
        balance = 0; // O saldo em reais agora é zero, pois foi todo usado na compra
  
        tradedCandles.push({ 
          date: candleDate,
          type: 'Compra', 
          candleIndex: index, 
          price: buyPrice, 
          candle,
          btcAmount,
          balanceAfterTrade: balance // O saldo após a compra é zero
        });
  
        console.log(`Candle: ${candleNumber} - ${candleDate} - Comprado a: Preço: ${buyPrice} | Estrategia: RSI+EMA200 |  RSI: ${rsi} | EMA200: ${ema200} | MACD: ${histogram} ${macd} ${signal}`);
        
  
        waitingForProfitableSell = false; // Após a compra, não estamos esperando uma venda lucrativa
      }

    // Sinal de venda - Continuar monitorando se o lucro é negativo
    if ( rsi > rsiSellThreshold && macd < signal && btcAmount > 0) { // ((closePrice - buyPrice)/buyPrice)*100 > 0.5 
      const profit = calculateProfit(buyPrice, closePrice, btcAmount);
      const profitPercentage = calculateProfitPercentage(buyPrice, closePrice);
      
      

      // Verifica se o lucro é negativo e continua aguardando uma venda favorável
      if (profitPercentage < 0 ) {
        console.log(`Candle: ${candleNumber} - ${candleDate} - Preço: ${closePrice} - Prejuizo de: ${profitPercentage.toFixed(2)}%. Aguardando venda favorável...`);
        waitingForProfitableSell = true;
        return;
      }

      // Vender todo o BTC se o lucro for positivo ou se estivermos esperando por uma venda lucrativa
      if (profitPercentage >= 0|| (waitingForProfitableSell && profitPercentage < 7)) {
        totalProfit += profit;
        balance = btcAmount * closePrice;  // Atualiza o saldo em reais após a venda
        btcAmount = 0;  // Zerar a quantidade de BTC, pois tudo foi vendido

        tradedCandles.push({ 
          date: candleDate,
          type: 'Venda', 
          candleIndex: index, 
          price: closePrice, 
          candle, 
          profit,
          profitPercentage,
          balanceAfterTrade: balance 
        });

        waitingForProfitableSell = false; // Após a venda lucrativa, resetar o estado de espera
        console.log(`Candle: ${candleNumber} - ${candleDate} - Vendido a: ${closePrice} | Lucro: ${profit} | Percentual: ${profitPercentage.toFixed(2)}% | Novo Saldo: ${balance}`);
      }
    }
  });

  console.log(`\nSaldo final: ${balance}`);
  console.log(`Lucro total: ${totalProfit}`);

  // Exibir o saldo final mensal
  getMonthlyBalance(candles, balance, tradedCandles);
}

// Função para processar cada linha do arquivo de candles
function processLine(line) {
  const regex = /Candle \d+ (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z): Fechamento = (\d+\.\d+), RSI = (\d+\.\d+), Histograma = (-?\d+), MACD = (-?\d+), Sinal = (-?\d+), EMA9 = (-?\d+), EMA21 = (-?\d+), EMA200 = (-?\d+)/;
  const match = line.match(regex);

  if (match) {
    return {
      candleNumber: match[0].split(' ')[1], 
      date: match[1],
      close: parseFloat(match[2]),
      rsi: parseFloat(match[3]),
      histograma: parseInt(match[4]),
      macd: parseInt(match[5]),
      signal: parseInt(match[6]),
      EMA9: match[7],
      EMA21: match[8],
      EMA200: match[9],
    };
  }
  return null;
}

// Leitura e processamento do arquivo de candles
function readData(filePath) {
  const data = [];
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');

  lines.forEach((line) => {
    const candle = processLine(line);
    if (candle) {
      data.push(candle);
    }
  });

  tradingStrategy(data);
}   

// Caminho do arquivo
const caminhoPlanilha = 'C:/temp/logBinance_2024-09-24_a_now_1m.txt';
readData(caminhoPlanilha);

