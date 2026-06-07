const BiService = require('../services/bi.service');
const WhatsappService = require('../services/whatsapp.service');

const getDemandForecast = async (req, res) => {
  try {
    const { productId } = req.params;
    const { daysBack = 30 } = req.query;
    const forecast = await BiService.getDemandForecast(productId, daysBack);
    res.json({ success: true, data: forecast });
  } catch (error) {
    console.error('Error in getDemandForecast:', error);
    res.status(500).json({ success: false, message: 'Internal server error: ' + error.message });
  }
};

const getLowStockPredictions = async (req, res) => {
  try {
    const { daysAhead = 7, daysBack = 30 } = req.query;
    const predictions = await BiService.getLowStockPredictions(daysAhead, daysBack);
    res.json({ success: true, data: predictions });
  } catch (error) {
    console.error('Error in getLowStockPredictions:', error);
    res.status(500).json({ success: false, message: 'Internal server error: ' + error.message });
  }
};

const getTrendingProducts = async (req, res) => {
  try {
    const { daysBack = 30 } = req.query;
    const trending = await BiService.getTrendingProducts(daysBack);
    res.json({ success: true, data: trending });
  } catch (error) {
    console.error('Error in getTrendingProducts:', error);
    res.status(500).json({ success: false, message: 'Internal server error: ' + error.message });
  }
};

const getProfitMarginAnalysis = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const analysis = await BiService.getProfitMarginAnalysis(startDate, endDate);
    res.json({ success: true, data: analysis });
  } catch (error) {
    console.error('Error in getProfitMarginAnalysis:', error);
    res.status(500).json({ success: false, message: 'Internal server error: ' + error.message });
  }
};

const sendWhatsappNotification = async (req, res) => {
  try {
    const { phone, type, invoiceNumber, amount, customerName, balance } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone number is required.' });
    }

    let result;
    if (type === 'INVOICE') {
      result = await WhatsappService.sendInvoiceMessage(phone, invoiceNumber, amount);
    } else if (type === 'OVERDUE') {
      result = await WhatsappService.sendOverdueReminders(phone, customerName, balance);
    } else {
      return res.status(400).json({ success: false, message: 'Invalid notification type.' });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error in sendWhatsappNotification:', error);
    res.status(500).json({ success: false, message: 'Internal server error: ' + error.message });
  }
};

module.exports = {
  getDemandForecast,
  getLowStockPredictions,
  getTrendingProducts,
  getProfitMarginAnalysis,
  sendWhatsappNotification
};
