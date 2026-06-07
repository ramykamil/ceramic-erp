class WhatsappService {
  /**
   * Send WhatsApp notification (Meta Cloud API placeholder)
   */
  static async sendMessage(phone, text) {
    const token = process.env.WHATSAPP_API_TOKEN || 'PLACEHOLDER_TOKEN';
    const numberId = process.env.WHATSAPP_PHONE_NUMBER_ID || 'PLACEHOLDER_NUMBER_ID';
    
    console.log(`[WHATSAPP_SERVICE] Sending message to ${phone} using Number ID: ${numberId}`);
    console.log(`[WHATSAPP_SERVICE] Message Content: "${text}"`);
    
    if (token === 'PLACEHOLDER_TOKEN') {
      return {
        success: true,
        logged: true,
        message: 'WhatsApp integration is currently in Sandbox/Demo mode. Message logged successfully.'
      };
    }

    try {
      // In the future when the user configures it:
      const response = await fetch(`https://graph.facebook.com/v18.0/${numberId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone,
          type: 'text',
          text: { body: text }
        })
      });
      const data = await response.json();
      return { success: response.ok, data };
    } catch (err) {
      console.error('[WHATSAPP_SERVICE] Error sending WhatsApp message:', err.message);
      return { success: false, error: err.message };
    }
  }

  static async sendInvoiceMessage(phone, invoiceNumber, amount) {
    const text = `Bonjour! Votre facture ${invoiceNumber} d'un montant de ${amount} DA a été générée avec succès. Merci de votre confiance! - Allaoua Ceram`;
    return this.sendMessage(phone, text);
  }

  static async sendOverdueReminders(phone, customerName, balance) {
    const text = `Bonjour ${customerName}, c'est un rappel concernant votre solde restant de ${balance} DA chez Allaoua Ceram. Merci de régulariser votre situation dès que possible.`;
    return this.sendMessage(phone, text);
  }
}

module.exports = WhatsappService;
