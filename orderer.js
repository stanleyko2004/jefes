const fs = require('fs');
require('dotenv').config();
const { Navigator } = require('./Navigator')


const jsonOrderToArgs = (order) => {
    const item = order.menuItem.name
    const options = []
    order.foodOptions.map(object => {
        object.options.map(option => options.push(option.name))
    })
    const comment = order.comment
    const quantity = order.quantity
    return [item, options, comment, quantity]
}

let rawdata = fs.readFileSync('ExampleJefesCart.json');
let json = JSON.parse(rawdata);

const orderingArgs = json.map(order => jsonOrderToArgs(order))

// console.log(orderingArgs);

const firstName = 'toppings'
const lastName = 'lastName' // idk???
const email = 'raymondqin@toppingsapp.com'
const number = '6787101220'
const tip = '0.00' // also idk???

const paymentInfo = [firstName, lastName, email, number, process.env.CREDIT_CARD_NUMBER, process.env.CREDIT_CARD_EXP, process.env.CREDIT_CARD_CCV, process.env.CREDIT_CARD_ZIP, tip];

// console.log(paymentInfo);

(async () => {
    const n = new Navigator('https://www.toasttab.com/el-jefes-taqueria/v3')
    const open = await n.init(false)
    if (open) {
        for (const args of orderingArgs) await n.addOrderToCart(...args)
        await n.checkout(...paymentInfo)
    }
    // await n.exit()
})()