const puppeteer = require('puppeteer');

class Navigator {
    constructor(url) {
        this.url = url
        this.menuItemToLink = {}
    }

    async init(headless = true) {
        this.browser = await puppeteer.launch({headless: headless})
        this.page = await this.browser.newPage()
        await this.page.goto(this.url)
        await this.wait()
        await this.makeMenuItemToLink()
        const pageUrl = await this.page.url
        if (pageUrl === this.url + '/?mode=fulfillment'){
            console.log('Ordering Ahead of Time')
            await this.editOrderTime()
        }
        const restaurantUnavailable = await this.page.$x(`//span[normalize-space(text())="Online Ordering Unavailable"]`)
        if (restaurantUnavailable != null){
            console.log('RESTAURANT NOT CURRENTLY AVAILABLE FOR ORDERS')
            await this.exit()
            return false
        }
        return true
    }

    async wait() {
        await this.page.waitForNavigation({
            waitUntil: 'networkidle0',
        });
    }

    async makeMenuItemToLink() {
        const itemToHref = async (item) => {
            const property = await item.getProperty('href')
            const href = await property.jsonValue()
            const name = await item.$eval('span[data-testid="menu-item-name"]', nameEl => nameEl.innerText)
            // console.log(name, href)
            this.menuItemToLink[name] = href
        }

        const items = await this.page.$$('a[data-testid="menu-item-link"]')
        const tasks = []
        for (const item of items){
            tasks.push(itemToHref(item))
        }

        await Promise.all(tasks)
    }

    async editOrderTime() {
        // sometimes modal pops up to let u order later when restaurant is closed
        const submitButton = await this.page.$('button[data-testid="fulfillment-selector-submit"]')
        await submitButton.evaluate(button => button.click())
    }

    async addOrderToCart(item, options, comment, quantity) {
        // item
        try {
            await this.page.goto(this.menuItemToLink[item])
            await this.wait()
            this.modal = await this.page.$('#modal-root')
        } catch(e) {
            console.error('CANNOT FIND MENU ITEM: ', item)
            return;
        }

        // options
        for (const option of options){
            // console.log(option)
            try {
                // cuz toast sometimes adds random whitespace
                const [optionText] = await this.modal.$x(`//div[normalize-space(text())="${option}"]`)
                optionText.evaluate(button => button.click())
            } catch(e) {
                console.error('CANNOT FIND OPTION: ', option)
                console.error(e)
                return;
            }
        }

        // quantity
        // console.log(this.modal.innerText)
        if (quantity < 1){
            console.error('QUANTITY CANNOT BE LESS THAN 1')
            return;
        }
        try {
            const incrementButton = await this.modal.$('button[data-testid="increment"]')
            for (let i=0; i<quantity-1; i++) await incrementButton.evaluate(button => button.click())
        } catch(e) {
            console.error('CANNOT INCREASE QUANTITY')
            console.error(e)
            return;
        }

        // comment
        try {
            const textArea = await this.modal.$('textarea[id="specialInstructions"]')
            await textArea.type(comment)
        } catch (e) {
            console.log('CANNOT ENTER COMMENT')
            console.error(e)
            return;
        }

        // add to cart
        const addToCartButton = await this.modal.$('button[data-testid="add-to-cart-button"]')
        await addToCartButton.evaluate(button => button.click())
        await this.wait()
    }

    async checkout(firstName, lastName, email, phoneNumber, cardNumber, cardExp, cardCCV, cardZip, tip) {
        await this.page.goto(this.url + '/checkout')
        await this.wait()
        const creditCardIframeElementHandle = await this.page.$('iframe[data-testid="credit-card-iframe"]')
        const creditCardIframe = await creditCardIframeElementHandle.contentFrame()

        // can't async all this cuz puppeteer uses one cursor to fill in everything so it gets all messed up
        await this.page.type('#customer_first_name', firstName)
        await this.page.type('#customer_last_name', lastName)
        await this.page.type('#customer_email', email)
        await this.page.type('#customer_tel', phoneNumber)

        // TODO giftcard apply

        await creditCardIframe.type('#credit_card_number', cardNumber)
        await creditCardIframe.type('#credit_card_exp', cardExp)
        await creditCardIframe.type('#credit_card_cvv', cardCCV)
        await creditCardIframe.type('#credit_card_zip', cardZip)

        // TODO promocard apply

        await this.page.type('#payment_tip', tip)

    }

    async exit() {
        await this.browser.close()
    }
}

if (require.main === module) {
    // basically python name==main
    (async () => {
        const n = new Navigator('https://www.toasttab.com/chinollo/v3')
        await n.init(headless = false)
        // await n.editOrderTime()
        // console.log(n.menuItemToLink)
        await n.addOrderToCart('Burrito Tray-1', ['El California Burrito', 'Sub chicken with beef on (6) halves of El California Burritos'], 'my comment', 5)
        await n.checkout('f', 'l', 'e', '1', '1111111111', '10/22', '111', '99999', '10.21')
        // await n.exit()
    })()
}

module.exports = { Navigator }